"""
多格式文档切块策略。

不同格式的切块逻辑不同：
  - PDF/Word/MD：RecursiveCharacterTextSplitter，图片描述块不切割
  - Excel：每个 Sheet 一个 chunk
  - PPT：每页一个 chunk，超长页才二次切割
  - 图片：整体一个 chunk
"""
import re
from langchain_text_splitters import RecursiveCharacterTextSplitter


def _make_splitter(chunk_size: int, chunk_overlap: int) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
    )


def chunk_by_file_type(
    file_type: str,
    page_texts: list[str],
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    """
    根据文件类型返回 chunk 列表。
    page_texts 是 parse_file 返回的每页/每块文本列表。
    """
    if file_type == "excel":
        # 每个 Sheet 一个 chunk，不切割
        return [t for t in page_texts if t.strip()]

    if file_type == "image":
        # 整张图片的描述作为单个 chunk
        return [t for t in page_texts if t.strip()]

    if file_type == "pptx":
        # 每页一个 chunk；超长页才二次切割，子块保留页码前缀
        chunks = []
        splitter = _make_splitter(chunk_size, chunk_overlap)
        for slide_text in page_texts:
            if not slide_text.strip():
                continue
            if len(slide_text) <= chunk_size * 1.5:
                chunks.append(slide_text)
            else:
                # 超长页：取首行作为前缀（"[第 N 页]"）
                lines = slide_text.split("\n", 1)
                prefix = lines[0] + "\n" if len(lines) > 1 else ""
                body = lines[1] if len(lines) > 1 else slide_text
                sub_chunks = splitter.split_text(body)
                chunks.extend(prefix + c for c in sub_chunks)
        return chunks

    # PDF / Word / Markdown：字符数切块，保护图片描述块不被切断
    IMAGE_BLOCK_RE = re.compile(r'(\[(?:图片内容|扫描页内容)\][^\[]*)', re.DOTALL)
    splitter = _make_splitter(chunk_size, chunk_overlap)
    chunks = []
    full_text = "\n\n".join(page_texts)
    # 先按图片块边界分段
    segments = IMAGE_BLOCK_RE.split(full_text)
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        if seg.startswith("[图片内容]") or seg.startswith("[扫描页内容]"):
            # 图片描述块：整块保留，不切割
            chunks.append(seg)
        else:
            # 普通文字：按字符数切割
            sub = splitter.split_text(seg)
            chunks.extend(sub)
    return [c for c in chunks if c.strip()]
