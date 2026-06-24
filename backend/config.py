"""
全局配置模块。

所有配置从 .env 文件加载，通过 pydantic-settings 自动注入。
这是整个系统的配置中心，所有模块都从这里读取配置。
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── LLM（大语言模型）：DeepSeek，使用 OpenAI 兼容接口 ──
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    llm_temperature: float = 0.7       # 生成温度（越低越忠实于参考内容）

    # ── Embedding（文本向量化）：智谱 AI embedding-3 ──
    embedding_api_key: str
    embedding_base_url: str
    embedding_model: str

    # ── JWT 认证 ──
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7天

    # ── 持久化存储路径 ──
    chroma_persist_dir: str = "./storage/chroma"   # 向量数据库持久化目录
    file_storage_dir: str = "./storage/files"       # 上传 PDF 文件存储目录

    # ── 文档处理与检索参数 ──
    max_upload_size_mb: int = 50
    chunk_size: int = 800              # 文本分块大小（字符数）
    chunk_overlap: int = 150           # 相邻块重叠字符数
    top_k_max_distance: float = 0.55   # 余弦距离阈值，超过此值过滤
    rrf_k: int = 60                    # RRF 常数（分母中的 K，越大排名差异对分数的影响越小）
    keyword_weight: float = 0.5        # 关键词排名权重（0~1，0.5=等权重，0=纯语义，1=纯关键词）
    fetch_count: int = 30              # 从向量库取多少个候选（阈值过滤后会进一步缩减）
    max_chunks: int = 15               # 最终返回的最大片段数（按相关度动态取，不超过此值）

    # ── CORS（跨域） ──
    cors_origins: list[str] = ["http://localhost:5173"]

    class Config:
        # 优先找 backend/.env，再找项目根目录 .env（兼容 Docker + 本地开发）
        env_file = ".env", "../.env"


# 全局单例配置对象，其他模块通过 from config import settings 使用
settings = Settings()
