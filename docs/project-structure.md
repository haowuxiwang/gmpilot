# GMPilot 项目结构设计

> 版本：v2.0 | 更新日期：2026-06-04

## 架构总览

```
Electron (桌面壳)
  ├─ Main Process (Node.js)
  │   ├─ SQLite (better-sqlite3 + sqlite-vec) — 向量存储 + 配置 + 历史
  │   ├─ 文件系统 — 法规文档、用户上传、报告导出
  │   ├─ XState 工作流 — 偏差生成 5 步流程
  │   └─ IPC Bridge — 与 Renderer 通信 (6 个模块)
  │
  └─ Renderer Process (React)
      ├─ Ant Design 5 — UI 组件
      ├─ React Router 6 — 路由
      └─ react-pdf — PDF 报告生成
```

**关键决策：无独立后端服务器。** 与 AuditBee（FastAPI + 独立进程）不同，GMPilot 的业务逻辑全部在 Electron 内运行。SQLite、LLM 调用、文件操作都在 Main Process 中通过 IPC 暴露给 Renderer。

## 目录结构

```
gmpilot/
├── package.json                    # 项目配置 + 依赖
├── tsconfig.json                   # TypeScript 配置
├── vitest.config.ts                # Vitest 测试配置
├── vite.config.ts                  # Vite 构建配置
├── CLAUDE.md                       # Claude Code 开发指南
│
├── electron/                       # Electron 主进程
│   ├── main.ts                     # 主进程入口
│   ├── preload.ts                  # preload 脚本（IPC 桥接）
│   └── ipc/                        # IPC 处理器（6 个模块）
│       ├── database.ts             # 数据库 CRUD
│       ├── llm.ts                  # LLM 调用 + 流式输出
│       ├── knowledge.ts            # 知识库 RAG 查询 + 文档管理
│       ├── file.ts                 # 文件读取
│       ├── workflow.ts             # 偏差工作流 + PDF 导出
│       └── auditbee.ts             # AuditBee 集成（健康检查、审计、Findings）
│
├── src/                            # React 渲染进程
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 路由 + 布局
│   ├── pages/                      # 6 个页面
│   │   ├── DashboardPage.tsx       # 仪表盘
│   │   ├── DeviationPage.tsx       # 偏差生成（核心工作流页面，~700 行）
│   │   ├── ReportsPage.tsx         # 报告列表 + 查看 + PDF 导出
│   │   ├── KnowledgePage.tsx       # 知识库管理（法规文档上传/搜索/删除）
│   │   ├── SettingsPage.tsx        # 设置（LLM Provider、API Key）
│   │   └── NotFoundPage.tsx
│   ├── components/                 # 公共组件
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ErrorBoundary.tsx
│   └── services/
│       └── api.ts                  # IPC 调用封装（settingsApi, reportApi, knowledgeApi, llmApi）
│
├── core/                           # 共享核心逻辑
│   ├── workflow/                   # XState 工作流
│   │   ├── deviation-machine.ts    # 偏差生成状态机（createDeviationMachine 工厂函数）
│   │   ├── types.ts                # 工作流类型 + AuditBee 枚举对齐
│   │   ├── report-types.ts         # 自动生成的报告类型（npm run codegen）
│   │   └── nodes/                  # 4 个工作流节点
│   │       ├── clue-analysis.ts    # 线索分析
│   │       ├── factor-identify.ts  # 5M1E 因素识别 + Finding 转换
│   │       ├── regulation-match.ts # 法规匹配（注入 RAG 上下文）
│   │       └── report-generate.ts  # 报告生成 + 风险评分计算
│   │
│   ├── llm/                        # LLM 调用层
│   │   ├── provider.ts             # 8 个 Provider 配置（deepseek/qwen/glm/openai/anthropic/siliconflow/openrouter/mimo）
│   │   ├── caller.ts               # 4 个高层操作 + 重试逻辑 + JSON Schema 从文件导入
│   │   ├── structured-output.ts    # 类型文档
│   │   └── prompts/                # Prompt 模板
│   │       ├── loader.ts           # 模板加载器（缓存 + 变量替换）
│   │       ├── schema-to-prompt.ts # Schema → 中文 JSON 示例转换
│   │       ├── clue-analysis.txt
│   │       ├── factor-identify.txt
│   │       ├── regulation-match.txt
│   │       └── report-generate.txt # 使用 {schema_description} 占位符
│   │
│   ├── rag/                        # RAG 检索层
│   │   ├── index.ts                # 共享 retriever 单例（initRetriever/getRetriever）
│   │   ├── embedder.ts             # Embedding 生成（本地 BAAI + 云端 OpenAI）
│   │   ├── chunker.ts              # 文档分块（中文章节识别 + 重叠窗口）
│   │   ├── store.ts                # sqlite-vec 向量存储 + 暴力搜索回退
│   │   └── retriever.ts            # 组合层（chunk → embed → store → retrieve）
│   │
│   ├── db/                         # 数据库层
│   │   ├── connection.ts           # SQLite 连接管理（WAL 模式）
│   │   ├── schema.ts               # 完整 CRUD（Settings/Reports/KnowledgeDocs）
│   │   └── migrations/
│   │       └── 001_init.sql        # 3 张表 + 3 个索引
│   │
│   ├── pdf/                        # PDF 生成
│   │   ├── generator.ts            # react-pdf renderToBuffer
│   │   └── templates/
│   │       └── DeviationReport.tsx # 偏差报告 PDF 模板（封面 + 7 章节）
│   │
│   ├── schema/                     # Schema 定义（单一真相源）
│   │   └── deviation-report-schema.json  # 偏差报告 JSON Schema
│   │
│   └── integration/                # AuditBee 集成
│       ├── auditbee-client.ts      # API 客户端（健康检查、上传、审计、轮询）
│       └── types.ts                # AuditBee 数据类型
│
├── scripts/                        # 工具脚本
│   └── codegen-types.ts            # 从 Schema 生成 TypeScript 类型（npm run codegen）
│
├── knowledge/                      # 法规知识库
│   ├── builtin/                    # 16 个内置法规文件
│   │   ├── gmp_china_ch01.txt ~ ch14.txt  # 中国 GMP 14 章
│   │   ├── ich_q9.txt              # ICH Q9 质量风险管理
│   │   └── ich_q10.txt             # ICH Q10 药品质量体系
│   └── user/                       # 用户上传的法规文档
│
├── docs/                           # 项目文档
│   ├── brainstorming.md            # 头脑风暴 + 技术选型
│   ├── project-structure.md        # 本文件
│   ├── integration.md              # AuditBee 集成方案
│   └── template-structure-analysis.md  # 偏差模板结构分析
│
├── config/                         # 配置文件
│   └── .env.example                # 环境变量模板
│
└── resources/                      # 静态资源
    └── fonts/                      # 中文字体（PDF 生成用，需手动下载）
```

## 与 AuditBee 的关键差异

| 维度 | AuditBee (Python) | GMPilot (TypeScript) |
|------|-------------------|---------------------|
| 后端 | FastAPI 独立服务器 | Electron Main Process (无独立后端) |
| Agent 框架 | LangGraph (Python) | XState (TypeScript) |
| LLM 调用 | langchain-openai/anthropic | Vercel AI SDK |
| 向量存储 | LightRAG + NanoVectorDB | sqlite-vec + better-sqlite3 |
| PDF 生成 | xhtml2pdf (Python) | react-pdf (TypeScript) |
| 进程模型 | Electron + FastAPI 双进程 | Electron 单应用 |

## 数据库 Schema

```sql
-- 设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 报告表
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  deviation_id TEXT,
  deviation_type TEXT NOT NULL,
  content TEXT NOT NULL,              -- JSON 格式完整报告
  clue_input TEXT,
  factors_json TEXT,
  regulations_json TEXT,
  findings_json TEXT,
  risk_score INTEGER,
  risk_level TEXT,
  pdf_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识库文档表
CREATE TABLE knowledge_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  source TEXT NOT NULL,               -- builtin/user
  content TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  indexed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
