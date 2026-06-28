from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import AsyncOpenAI
from datetime import datetime
import json

from database import get_db, SessionLocal
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.conversation import Conversation
from models.message import Message
from routers.auth import get_current_user
from config import settings
from services.vector_service import vector_service

router = APIRouter()


class ChatRequest(BaseModel):
    question: str


def _get_or_create_conversation(kb_id: str, user_id: str, db: Session) -> Conversation:
    """获取知识库的唯一对话，不存在则创建"""
    conv = db.query(Conversation).filter(
        Conversation.knowledge_base_id == kb_id,
        Conversation.user_id == user_id,
    ).first()
    if conv:
        return conv
    conv = Conversation(
        knowledge_base_id=kb_id,
        user_id=user_id,
        title="默认对话",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.post("/knowledge-bases/{kb_id}/chat")
async def chat(
    kb_id: str,
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if kb.ready_doc_count == 0:
        raise HTTPException(status_code=400, detail="知识库中没有可用文档，请先上传并等待处理完成")

    conv = _get_or_create_conversation(kb_id, current_user.id, db)
    history_messages = conv.messages[-20:] if conv.messages else []

    async def generate():
        # 先保存用户消息，确保不丢失
        with SessionLocal() as save_db:
            save_conv = save_db.get(Conversation, conv.id)
            if save_conv:
                save_db.add(Message(
                    conversation_id=conv.id,
                    role="user",
                    content=request.question,
                ))
                save_conv.updated_at = datetime.utcnow()
                save_db.commit()

        retrieved = vector_service.query(kb_id, request.question)

        sources = [
            {
                "filename": r["filename"],
                "document_id": r.get("document_id", ""),
                "chunk_index": r["chunk_index"],
                "page_number": r.get("page_number", 0),
                "file_type": r.get("file_type", "pdf"),
                "distance": r["distance"],
                "score": r.get("score", 0),
                "text_preview": r["text"][:150],
            }
            for r in retrieved
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources}, ensure_ascii=False)}\n\n"

        full_answer = ""

        try:
            # 检索结果为空时直接返回友好提示，不调 LLM
            if not retrieved:
                full_answer = "根据知识库中的文档，未能找到与该问题相关的内容。请尝试换一种表述方式提问，或确认相关文档已上传并处于就绪状态。"
                yield f"data: {json.dumps({'type': 'token', 'content': full_answer}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            context = "\n\n---\n\n".join(r['text'] for r in retrieved)

            system_prompt = f"""你是一个专业的知识库问答助手。

检索到的参考内容：
{context}

要求：
- 只根据参考内容回答，不要编造
- 用自己的话归纳，不要逐字复制原文
- 如果内容不足以回答问题，直接说：文档中没有相关信息
- 不要输出【来源】、文件名等引用标注
- 回答中的关键名词用 **加粗** 突出"""

            messages_llm = [{"role": "system", "content": system_prompt}]
            for msg in history_messages:
                messages_llm.append({"role": msg.role, "content": msg.content})
            messages_llm.append({"role": "user", "content": request.question})

            client = AsyncOpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url,
            )

            stream = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages_llm,
                stream=True,
                temperature=settings.llm_temperature,
                max_tokens=4096,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    full_answer += delta.content
                    yield f"data: {json.dumps({'type': 'token', 'content': delta.content}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            # 无论成功还是中断，都保存已生成的内容（至少用户消息已保存）
            if full_answer:
                with SessionLocal() as save_db:
                    save_conv = save_db.get(Conversation, conv.id)
                    if save_conv:
                        save_db.add(Message(
                            conversation_id=conv.id,
                            role="assistant",
                            content=full_answer,
                            sources=json.dumps(sources, ensure_ascii=False),
                        ))
                        save_conv.updated_at = datetime.utcnow()
                        save_db.commit()

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/knowledge-bases/{kb_id}/messages")
def get_kb_messages(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")

    conv = db.query(Conversation).filter(
        Conversation.knowledge_base_id == kb_id,
        Conversation.user_id == current_user.id,
    ).first()
    if not conv:
        return []

    messages = db.query(Message).filter(
        Message.conversation_id == conv.id
    ).order_by(Message.created_at).offset(offset).limit(limit).all()

    result = []
    for m in messages:
        item = {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        if m.sources:
            try:
                item["sources"] = json.loads(m.sources)
            except (json.JSONDecodeError, TypeError):
                item["sources"] = None
        else:
            item["sources"] = None
        result.append(item)

    return result


@router.delete("/knowledge-bases/{kb_id}/messages")
def clear_kb_messages(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kb = db.get(KnowledgeBase, kb_id)
    if not kb or kb.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="知识库不存在")

    conv = db.query(Conversation).filter(
        Conversation.knowledge_base_id == kb_id,
        Conversation.user_id == current_user.id,
    ).first()
    if conv:
        db.query(Message).filter(Message.conversation_id == conv.id).delete()
        db.commit()
    return {"message": "对话记录已清除"}
