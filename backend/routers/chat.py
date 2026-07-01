import re
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import AsyncOpenAI

from database import get_db, SessionLocal
from models.user import User
from models.knowledge_base import KnowledgeBase
from models.conversation import Conversation
from models.message import Message
from routers.auth import get_current_user
from config import settings
from services.vector_service import vector_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge-bases", tags=["chat"])

# ── LLM 客户端单例（AsyncOpenAI 内部 httpx 连接池可安全并发）──
_llm_client: AsyncOpenAI | None = None

def _get_llm_client() -> AsyncOpenAI:
    global _llm_client
    if _llm_client is None:
        _llm_client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
    return _llm_client

# ── 代词模式：检测问题是否包含指代前文的人称/指示代词 ──
_PRONOUN_RE = re.compile(r'(它|他|她|它们|他们|她们|这|那|该|此|其'
                         r'|这个|那个|这些|那些|上述|以上|前者|后者'
                         r'|上文|如下|下列|以下|下列)')

# ── 查询改写 ──

def _needs_rewrite(question: str) -> bool:
    """检测问题是否包含代词，需要结合对话历史才能理解。"""
    return bool(_PRONOUN_RE.search(question))


async def _rewrite_query(
    history: list[dict],
    question: str,
    client: AsyncOpenAI,
) -> str:
    """调用 LLM 将含代词的问题改写为包含完整上下文的独立问题。"""
    # 取最近 2 轮对话作为上下文
    recent = history[-4:] if len(history) >= 4 else history

    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个查询改写助手。根据对话历史，把用户的最新问题改写成"
                        "一个包含完整上下文的独立问题。"
                        "要求：\n"
                        "1. 将代词替换为具体名词\n"
                        "2. 补全省略的上下文\n"
                        "3. 保留原问题的所有信息\n"
                        "4. 只输出改写后的问题，不要任何额外内容"
                    ),
                },
                *recent,
                {"role": "user", "content": f"改写成独立问题：{question}"},
            ],
            temperature=0,
            max_tokens=128,
        )
        rewritten = resp.choices[0].message.content.strip()
        if rewritten:
            return rewritten
    except Exception:
        pass
    return question  # 改写失败则用原文


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


@router.post("/{kb_id}/chat")
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

        # 获取 LLM 客户端（模块级单例，复用 httpx 连接池）
        client = _get_llm_client()

        # 多轮对话查询改写：将代词替换为实体词
        query_text = request.question
        if history_messages and _needs_rewrite(query_text):
            rewritten = await _rewrite_query(history_messages, query_text, client)
            if rewritten != query_text:
                logger.info("query rewrite: %r → %r", query_text, rewritten)
                query_text = rewritten

        retrieved = vector_service.query(kb_id, query_text)

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
            # 无论是否生成完成，都保存（切换页面后回来能看到部分内容）
            with SessionLocal() as save_db:
                save_conv = save_db.get(Conversation, conv.id)
                if save_conv:
                    save_db.add(Message(
                        conversation_id=conv.id,
                        role="assistant",
                        content=full_answer or "（回答被中断，请重试）",
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


@router.get("/{kb_id}/messages")
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


@router.delete("/{kb_id}/messages")
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
