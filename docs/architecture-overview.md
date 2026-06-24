# Novalume — 项目架构与模块概览

> 本地 RAG 知识库问答系统，支持多用户、多知识库、PDF 解析、向量检索、流式对话

---

## 一、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                      前端 (React + Vite)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  用户界面  │ │  状态管理  │ │  API 层   │ │  组件库       │  │
│  │  (页面)   │ │ (Zustand)│ │ (Axios)  │ │ (shadcn/ui)   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│                          │ HTTP (REST + SSE)                  │
├──────────────────────────┼────────────────────────────────────┤
│                    FastAPI (Python)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  路由层    │ │  业务逻辑  │ │  数据模型  │ │  外部服务      │  │
│  │ (routers) │ │ (services)│ │ (models) │ │ (LLM/向量库)   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│                          │                                    │
├──────────┬──────────┬────┼────┬──────────┬──────────┬────────┤
│  SQLite  │ ChromaDB │    │    │ DeepSeek │  智谱 AI  │  文件系统 │
│  (关系)   │  (向量)   │    │    │  (LLM)   │ (Embed)  │  (PDF)  │
└──────────┴──────────┘    │    └──────────┴──────────┴────────┘
                           │ (用户会话、JWT)
```

---

## 二、技术栈

### 后端
| 技术 | 用途 | 版本 |
|------|------|------|
| **Python** | 运行语言 | 3.11+ |
| **FastAPI** | Web 框架 | 0.110+ |
| **Uvicorn** | ASGI 服务器 | 0.29+ |
| **SQLAlchemy** | ORM（对象关系映射） | 2.0+ |
| **SQLite** | 关系数据库 | 内置 |
| **ChromaDB** | 向量数据库 | 0.5+ |
| **DeepSeek API** | LLM 对话模型 | OpenAI 兼容 |
| **智谱 AI API** | Embedding 模型（embedding-3, 2048维） | OpenAI 兼容 |
| **jieba** | 中文分词（混合搜索） | 0.42+ |
| **python-jose** | JWT 加解密 | 3.3+ |
| **passlib/bcrypt** | 密码哈希 | 4.0.1 |
| **pymupdf** | PDF 解析 | 1.24+ |

### 前端
| 技术 | 用途 | 版本 |
|------|------|------|
| **React** | UI 框架 | 18 |
| **TypeScript** | 类型安全 | 5+ |
| **Vite** | 构建工具 | 5 |
| **Tailwind CSS** | 原子化样式 | 3 |
| **shadcn/ui** | 组件库 | 最新 |
| **Zustand** | 状态管理 | 4+ |
| **react-pdf** | PDF 阅读器 | 10 |
| **react-markdown** | Markdown 渲染 | 9+ |
| **axios** | HTTP 客户端 | 1+ |

---

## 三、后端模块详解

### 3.1 数据模型层 (`backend/models/`)

| 文件 | 模型 | 数据库表 | 核心字段 | 说明 |
|------|------|---------|---------|------|
| `user.py` | User | `users` | id, username, email, password_hash, is_admin, is_active | 用户账户，级联删除关联的 KB |
| `knowledge_base.py` | KnowledgeBase | `knowledge_bases` | id, user_id(FK), name, description | 知识库容器，`doc_count`/`ready_doc_count` 为 @property |
| `document.py` | Document | `documents` | id, kb_id(FK), user_id(FK), filename, file_path, status | PDF 文档记录，status: pending→processing→ready/failed |
| `conversation.py` | Conversation | `conversations` | id, kb_id(FK), user_id(FK), title | 每个知识库单一对话，级联删除消息 |
| `message.py` | Message | `messages` | id, conversation_id(FK), role, content, sources(JSON) | 单条对话消息，sources 存引用来源 |

**关系图：**
```
User 1─N KnowledgeBase 1─N Document
                       1─N Conversation 1─N Message
```

### 3.2 路由层 (`backend/routers/`)

| 文件 | 前缀 | 核心路由 | 功能 |
|------|------|---------|------|
| `auth.py` | `/api/auth` | register, login, me, profile, password, account, avatar | 注册登录、JWT 鉴权、资料修改、头像上传、账号注销 |
| `knowledge_bases.py` | `/api/knowledge-bases` | GET/POST/PUT/DELETE | 知识库 CRUD |
| `documents.py` | `/api`(无前缀) | POST/GET/PUT/DELETE /kb/{id}/documents | 文档上传(PDF)、列表、重命名、删除、文件下载 |
| `chat.py` | `/api`(无前缀) | POST /kb/{id}/chat (SSE), GET/DELETE /messages | 流式对话、消息历史、清除记录 |
| `admin.py` | `/api/admin` | GET stats, GET/PUT/POST/DELETE users | 管理后台：统计、用户管理（搜索/分页/禁用/重置密码/删除） |

**鉴权流程：**
```
请求 → HTTPBearer → get_current_user() → decode_token(JWT) → 查 DB → 返回 User
                    ↓ (失败)
                401/403
```

### 3.3 服务层 (`backend/services/`)

| 文件 | 功能 | 核心逻辑 |
|------|------|---------|
| `auth_service.py` | 密码哈希 + JWT | bcrypt 哈希/校验；jose 签发/解码 JWT（7天过期） |
| `vector_service.py` | 向量检索 | ChromaDB CRUD + RRF混合搜索（cosine + jieba关键词→融合排序） |
| `pdf_service.py` | PDF 解析 | pymupdf 提取文本 + RecursiveCharacterTextSplitter 分块（800字/块，150重叠） |
| `document_processor.py` | 文档处理流水线 | 后台线程：解析PDF → 分块 → 匹配页码 → 写入ChromaDB |

### 3.4 配置层

| 文件 | 内容 |
|------|------|
| `config.py` | 所有配置项（API Key、模型、路径、检索参数），通过 pydantic-settings 从 `.env` 加载 |
| `database.py` | SQLAlchemy 引擎 + Session 工厂 + 依赖注入函数 `get_db()` |

### 3.5 数据流：上传文档到对话

```
用户上传 PDF
    ↓
POST /documents → 保存到 disk/{kb_id}/{doc_id}.pdf → 创建 Document 记录 → 后台线程
    ↓
process_document():
  1. pymupdf 解析 → 全文 + 逐页文本
  2. RecursiveCharacterTextSplitter 分块 (800字, 150重叠)
  3. 每块匹配页码 (前80字指纹)
  4. 写入 ChromaDB (batch_size=50, 智谱限制)
  5. 更新状态为 ready
    ↓
用户提问
    ↓
POST /chat (SSE):
  1. vector_service.query() → ChromaDB 查 top-9 → 过滤 >0.55 → jieba分词
     → 关键词评分 → RRF融合排序 → 返回 top-3
  2. 若结果为空 → "未找到相关内容"
  3. 否则 → 构建 system prompt + 对话历史 → 调 DeepSeek 流式 API
  4. token 逐段 SSE 推送到前端
  5. 完成后保存到 SQLite
```

---

## 四、前端模块详解

### 4.1 目录结构

```
frontend/src/
├── api/            # 后端 API 调用（axios 封装）
│   ├── client.ts       # axios 实例 + 拦截器（自动注入 JWT、401 登出）
│   ├── auth.ts         # 认证相关
│   ├── knowledgeBases.ts
│   ├── documents.ts
│   ├── chat.ts         # SSE 流式聊天
│   └── admin.ts
├── store/          # Zustand 状态管理
│   ├── authStore.ts    # 登录状态（persist 到 localStorage）
│   └── kbStore.ts      # 当前知识库 + 版本号（用于跨组件同步）
├── types/          # TypeScript 接口定义
│   └── index.ts        # SourceItem, ChatMessage, KnowledgeBase, Document 等
├── components/     # UI 组件
│   ├── ui/             # shadcn/ui 基础组件（button, card, input, dialog 等）
│   ├── layout/         # 布局（Sidebar, AppLayout）
│   ├── chat/           # 聊天（MessageItem, ChatWindow, ChatInput, TypingIndicator, SourcePanel, PdfViewerDialog）
│   ├── knowledge-base/ # 知识库（KBItem, KBCreateModal, KBRenameModal, KBDeleteDialog）
│   ├── brand/          # 品牌（LogoFull SVG）
│   └── admin/          # 管理后台（AdminLayout, AdminSidebar）
└── pages/          # 页面组件（路由入口）
    ├── LoginPage.tsx
    ├── RegisterPage.tsx
    ├── SettingsPage.tsx
    ├── KnowledgeBasePage.tsx   # 文档管理
    ├── ChatPage.tsx            # 对话
    ├── PdfViewerPage.tsx       # PDF 阅读器
    └── admin/
        ├── AdminDashboardPage.tsx
        ├── AdminUsersPage.tsx
        └── AdminUserDetailPage.tsx
```

### 4.2 路由设计

| 路径 | 页面 | 权限 | 说明 |
|------|------|------|------|
| `/login` | LoginPage | 游客 | 用户/管理员登录 Tab |
| `/register` | RegisterPage | 游客 | 注册 |
| `/` | 重定向 | 用户 | 跳转到第一个 KB 的 docs |
| `/kb/:kbId/docs` | KnowledgeBasePage | 用户 | 文档管理 |
| `/kb/:kbId/docs/:docId` | PdfViewerPage | 用户 | PDF 阅读 |
| `/kb/:kbId/chat` | ChatPage | 用户 | 对话 |
| `/settings` | SettingsPage | 用户 | 个人设置 |
| `/admin` | AdminDashboardPage | 管理员 | 系统总览 |
| `/admin/users` | AdminUsersPage | 管理员 | 用户列表 |
| `/admin/users/:id` | AdminUserDetailPage | 管理员 | 用户详情 |

### 4.3 关键组件交互

```
Sidebar                         ← 知识库列表、展开文档、切换聊天
  ├─ KBItem                     ← 每个知识库条目（展开/折叠/右键菜单）
  │   ├─ KBRenameModal          ← 重命名知识库
  │   └─ KBDeleteDialog         ← 删除知识库确认
  ├─ KBCreateModal              ← 新建知识库
  └─ 用户信息底部                 ← 设置/登出

KnowledgeBasePage               ← 文档管理（上传/列表/重命名/删除）
  ├─ upload (react-dropzone)     ← 拖拽或点击上传 PDF
  └─ 文档表格                    ← 文件名(可点击查看)、大小、页数、状态、操作

ChatPage                        ← 对话
  ├─ ChatWindow                 ← 消息列表
  │   ├─ MessageItem            ← 单条消息（用户气泡/助手气泡）
  │   │   └─ SourcePanel        ← 展开引用来源列表
  │   │       └─ PdfViewerDialog← 弹窗 PDF 阅读器
  │   └─ TypingIndicator        ← 打字动画
  └─ ChatInput                  ← 输入框 + 发送/停止按钮
```

---

## 五、关键设计决策

### 5.1 混合搜索（RRF）

```
Dense (cosine) + Sparse (jieba关键词) → RRF融合
                ↓
分数 = 1/(60 + dense_rank) + 1/(60 + sparse_rank)
```

解决纯 embedding 搜索"关键词匹配弱"的问题——专有名词（人名/地名）不再被语义淹没。

### 5.2 单一对话设计

每个知识库只有一个 Conversation，对话历史通过 `updated_at` 追踪。简化了多会话管理的复杂度。

### 5.3 后台异步处理

文档上传后通过 `run_in_executor` 在独立线程中解析，不阻塞主事件循环。每个文档独立处理，一个失败不影响其他。

### 5.4 SSE 流式输出

使用 Server-Sent Events 实现对话 token 逐字输出，通过 `StreamingResponse` + `async generator` 实现，包含 sources 事件（先发）、token 事件（流式）、done 事件（结束）。

---

## 六、数据生命周期

```
用户注册 → 创建知识库 → 上传PDF → 解析/分块/embed → 存入ChromaDB
                                                      ↓
用户提问 → 检索ChromaDB → RRF融合 → 调DeepSeek → 流式返回 → 保存对话
                                                      ↓
用户删除文档 → 删文件 + 删ChromaDB chunks + 删DB记录 → 更新历史消息来源
用户删除知识库 → 删目录 + 删ChromaDB collection + cascade删DB
用户注销 → 删所有KB(含文件+向量) + 删头像 + cascade删用户
```
