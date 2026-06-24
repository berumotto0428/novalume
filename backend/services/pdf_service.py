import fitz
from langchain_text_splitters import RecursiveCharacterTextSplitter


def parse_pdf(file_path: str):
    """
    返回 (full_text, page_count, page_texts)
    - full_text: 所有页文本用 \n\n 拼接
    - page_count: 总页数
    - page_texts: 每页的文本列表，用于追踪文本块所属页码
    """
    doc = fitz.open(file_path)
    page_texts = []
    for page in doc:
        text = page.get_text("text").strip()
        page_texts.append(text)
    page_count = len(doc)
    doc.close()

    full_text = "\n\n".join(page_texts)
    return full_text, page_count, page_texts


def split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
    )
    return splitter.split_text(text)
