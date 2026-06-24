# NovaLume

> 本地 RAG 知识库问答系统 — 多用户 · 多知识库 · PDF 解析 · 向量检索 · 流式对话

---

## 功能

- 用户注册/登录，数据完全隔离
- 创建多个知识库，每个库可上传多份 PDF
- 自动解析 PDF、语义切块、向量化索引
- 基于检索增强生成的流式对话，展示引用来源
- PDF 在线阅读器（目录跳转、内部链接导航）
- 混合搜索（语义向量 + 关键词 RRF 融合）
- 管理员后台（用户管理、统计、重置密码）
- 用户设置（头像、修改密码、注销）

## 技术栈

| 层 | 技术 |
|------|------|
| 后端 | Python 3.13 / FastAPI / SQLAlchemy / SQLite |
| 向量库 | ChromaDB（cosine + HNSW） |
| LLM | DeepSeek（OpenAI 兼容接口） |
| Embedding | 智谱 AI embedding-3（2048 维） |
| 前端 | React 18 / TypeScript / Vite 5 / Tailwind CSS 3 |
| 检索 | RRF 混合搜索（语义 + jieba 关键词） |

## 快速开始

### 本地运行

```bash
# 后端
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # 编辑 .env 填写 API Key
python -m uvicorn main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173`

### Docker 部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填写 API Key

# 2. 一键启动
docker compose up -d
```

访问 `http://localhost`

### 创建管理员

```bash
cd backend
python scripts/create_admin.py
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| PUT | `/api/auth/profile` | 修改资料 |
| PUT | `/api/auth/password` | 修改密码 |
| POST | `/api/auth/avatar` | 上传头像 |
| DELETE | `/api/auth/account` | 注销账号 |
| | | |
| GET | `/api/knowledge-bases` | 知识库列表 |
| POST | `/api/knowledge-bases` | 创建知识库 |
| PUT | `/api/knowledge-bases/{id}` | 更新知识库 |
| DELETE | `/api/knowledge-bases/{id}` | 删除知识库 |
| | | |
| POST | `/api/knowledge-bases/{id}/documents` | 上传文档 |
| GET | `/api/knowledge-bases/{id}/documents` | 文档列表 |
| PUT | `/api/knowledge-bases/{id}/documents/{doc_id}` | 重命名文档 |
| DELETE | `/api/knowledge-bases/{id}/documents/{doc_id}` | 删除文档 |
| | | |
| POST | `/api/knowledge-bases/{id}/chat` | 流式对话（SSE） |
| GET | `/api/knowledge-bases/{id}/messages` | 消息历史 |
| DELETE | `/api/knowledge-bases/{id}/messages` | 清除对话记录 |
| | | |
| GET | `/api/admin/stats` | 系统统计 |
| GET | `/api/admin/users` | 用户列表 |
| PUT | `/api/admin/users/{id}/status` | 禁用/启用用户 |
| POST | `/api/admin/users/{id}/reset-password` | 重置密码 |
| DELETE | `/api/admin/users/{id}` | 删除用户 |

## License

MIT
