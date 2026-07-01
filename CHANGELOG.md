# Changelog

## v1.1.0 (2026-07-01)

- 多格式文件支持（Word/Excel/PPT/Markdown/图片）
- 文件预览（LibreOffice 转换 + SheetJS + react-markdown）
- 多轮对话查询改写（代词消解）
- BM25 关键词评分替代简单 set 交集
- 检索流程重排：关键词排名提到距离过滤之前
- RRF 相对阈值过滤代替硬距离过滤
- Embedding API 并行化（5线程→12线程）
- 视觉模型客户端线程安全修复
- 文档处理超时保护（300s）
- 全项目 print() → logging
- 代码审查修复 19 项（SQL注入防护、Docker构建、类型风格统一等）

## v1.0.0 (2026-06-23)

- Initial release
- Multi-user auth with JWT
- Knowledge base CRUD
- PDF upload, parsing, chunking, vectorization
- Streaming Q&A with DeepSeek
- Hybrid search (dense + keyword RRF)
- Admin panel (user management, stats)
- PDF reader with outline navigation
- Docker deployment support
