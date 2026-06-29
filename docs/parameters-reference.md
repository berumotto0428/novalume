# RAG 系统参数一览

## 一、模型参数

### 1.1 大语言模型（LLM）— DeepSeek
| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| API Key | `LLM_API_KEY` | (已填) | DeepSeek API 密钥 |
| 接口地址 | `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI 兼容接口 |
| 模型名 | `LLM_MODEL` | `deepseek-chat` | 生成回答的模型 |
| 温度 | `LLM_TEMPERATURE` | `0.7` | 越低越忠实于参考内容，范围 0~2 |
| 最大 Token | 代码硬编码 | `4096` | 单次回答最大 token 数 |

### 1.2 文本向量化（Embedding）— 智谱 AI
| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| API Key | `EMBEDDING_API_KEY` | (已填) | 智谱 AI API 密钥 |
| 接口地址 | `EMBEDDING_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 智谱 AI 接口 |
| 模型名 | `EMBEDDING_MODEL` | `embedding-3` | 输出 2048 维向量 |

### 1.3 视觉模型 — 通义千问 Qwen-VL-Flash
| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| API Key | `VISION_API_KEY` | (已填) | 通义千问视觉 API 密钥 |
| 接口地址 | `VISION_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容接口 |
| 模型名 | `VISION_MODEL` | `qwen3.6-plus` | 图片理解和描述 |

---

## 二、文档处理参数

| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| 单文件大小上限 | `MAX_UPLOAD_SIZE_MB` | `50` | 单个上传文件最大值（MB） |
| 文本分块大小 | `CHUNK_SIZE` | `1000` | 每块字符数，PDF/Word/MD 按此切割 |
| 相邻块重叠 | `CHUNK_OVERLAP` | `200` | 相邻块重叠字符数，减少切碎语义 |

### 切块策略（代码逻辑，不可配置）
| 格式 | 策略 |
|------|------|
| PDF / Word / Markdown | `RecursiveCharacterTextSplitter(chunk_size, chunk_overlap)`，图片描述块整块保留不切割 |
| Excel | 每个 Sheet 一个 chunk，不跨 Sheet |
| PPT | 每页一个 chunk，超长页（>chunk_size×1.5）才二次切割 |
| 图片 | 整张图片描述作为一个 chunk |

---

## 三、信息检索参数

| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| 候选数量 | `FETCH_COUNT` | `30` | 从向量库取多少个候选（阈值过滤后会缩减） |
| 距离阈值 | `TOP_K_MAX_DISTANCE` | `0.65` | 余弦距离阈值，超过此值直接过滤 |
| RRF 常数 | `RRF_K` | `40` | RRF 公式中的 K，越大排名差异对分数影响越小 |
| 关键词权重 | `KEYWORD_WEIGHT` | `0.4` | 关键词排名权重（0~1）：0=纯语义，1=纯关键词 |
| 最终片段上限 | `MAX_CHUNKS` | `10` | 最终传给 LLM 的最大片段数 |

### 检索流程
```
用户问题 → Embedding 向量化 → ChromaDB 余弦相似度（取 FETCH_COUNT 个）
  → 距离阈值过滤（distance > TOP_K_MAX_DISTANCE 丢弃）
  → jieba 分词 → 关键词命中率评分
  → 加权 RRF 排序：(1-KEYWORD_WEIGHT)/(RRF_K+语义排名) + KEYWORD_WEIGHT/(RRF_K+关键词排名)
  → 取前 MAX_CHUNKS 个
  → 拼入上下文 → LLM 生成回答
```

---

## 四、内容生成参数

| 参数 | 来源 | 当前值 | 说明 |
|------|------|--------|------|
| 模型 | `LLM_MODEL` | `deepseek-chat` | 生成回答的模型 |
| 温度 | `LLM_TEMPERATURE` | `0.7` | 生成随机性 |
| 最大 Token | 代码硬编码 | `4096` | 单次回答长度上限 |
| 上下文窗口 | 拼接结果 | 动态 | 检索到的 chunks 拼入 system prompt |

### System Prompt（代码硬编码）
```
你是一个专业的知识库问答助手。

检索到的参考内容：
{context}

要求：
- 只根据参考内容回答，不要编造
- 用自己的话归纳，不要逐字复制原文
- 如果内容不足以回答问题，直接说：文档中没有相关信息
- 不要输出【来源】、文件名等引用标注
- 回答中的关键名词用 **加粗** 突出
```

---

## 五、其他配置

| 参数 | `.env` 变量 | 当前值 | 说明 |
|------|------------|--------|------|
| CORS 来源 | `CORS_ORIGINS` | `["http://localhost:5173","http://localhost"]` | 允许的前端地址 |
| JWT 密钥 | `JWT_SECRET_KEY` | (已填) | 身份验证签名密钥 |
| JWT 算法 | 代码硬编码 | `HS256` | 加密算法 |
| Token 有效期 | 代码硬编码 | `10080` 分钟（7天） | 登录有效期 |
| 向量库目录 | 代码硬编码 | `./storage/chroma` | ChromaDB 持久化路径 |
| 文件存储目录 | 代码硬编码 | `./storage/files` | 上传文件存储路径 |
