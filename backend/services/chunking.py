"""
多格式文档切块策略。

不同格式的切块逻辑不同：
  - PDF/Word/MD：RecursiveCharacterTextSplitter，图片描述块不切割
  - Excel：每个 Sheet 一个 chunk
  - PPT：每页一个 chunk，超长页才二次切割
  - 图片：整体一个 chunk
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter


def _make_splitter(chunk_size: int, chunk_overlap: int) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
    )


def _chunk_long_excel(sheet_text: str, chunk_size: int) -> list[str]:
    """Excel 超长 Sheet 按行切割，每块保留表头（工作表名 + 列名）。"""
    lines = sheet_text.split('\n')
    if len(lines) < 4:
        return [sheet_text]

    header = lines[0]   # "## 工作表：xxx"
    title = lines[1]    # "| 列1 | 列2 |"
    sep = lines[2]      # "| --- | --- |"
    data = lines[3:]    # 数据行

    prefix = [header, title, sep]
    prefix_len = sum(len(l) + 1 for l in prefix)  # +1 for newline

    chunks = []
    current = prefix.copy()
    current_len = prefix_len

    for line in data:
        line_len = len(line) + 1
        if current_len + line_len > chunk_size and len(current) > len(prefix):
            chunks.append('\n'.join(current))
            current = prefix.copy()
            current_len = prefix_len
        current.append(line)
        current_len += line_len

    if len(current) > len(prefix):
        chunks.append('\n'.join(current))

    if not chunks:
        chunks.append(sheet_text)
    return chunks


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
        # 每个 Sheet 一个 chunk；超长 Sheet 按行切割，每块保留表头
        chunks = []
        for sheet_text in page_texts:
            if not sheet_text.strip():
                continue
            if len(sheet_text) <= chunk_size:
                chunks.append(sheet_text)
            else:
                chunks.extend(_chunk_long_excel(sheet_text, chunk_size))
        return chunks

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

    # PDF / Word / Markdown：统一用 RecursiveCharacterTextSplitter 切割
    # 注意：不依赖正则识别图片块边界。视觉模型的描述输出控制在 max_tokens=1000
    # 以内（约 500-700 中文字符），天然小于 chunk_size，不会被切断。
    # 如果描述恰好跨越 chunk 边界，重叠的 200 字符会保留上下文。
    splitter = _make_splitter(chunk_size, chunk_overlap)
    full_text = "\n\n".join(page_texts)
    chunks = splitter.split_text(full_text)
    return [c for c in chunks if c.strip()]
