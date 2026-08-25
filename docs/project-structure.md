# GMPilot 项目结构设计

> 版本：v3.1 | 更新日期：2026-08-10

## 架构总览

```
Electron (桌面壳)
  ├─ Main Process (Node.js)
  │   ├─ SQLite (better-sqlite3 + sqlite-vec) — 向量存储 + 配置 + 历史
  │   ├─ 文件系统 — 法规文档、用户上传、报告导出
  │   ├─ XState 工作流 — 偏差生成 7 步流程
  │   └─ IPC Bridge — 与 Renderer 通信 (8 个模块)
  │
  └─ Renderer Process (React)
      ├─ Tailwind CSS v4 — 样式系统
      ├─ Radix UI — 无头组件
      ├─ React Router v7 — 路由
      ├─ GSAP — 动画
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
├── electron-builder.yml            # Electron 打包配置
├── CLAUDE.md                       # Claude Code 开发指南
│
├── electron/                       # Electron 主进程
│   ├── main.ts                     # 主进程入口 + 单实例锁
│   ├── preload.ts                  # preload 脚本（IPC 桥接）
│   ├── splash.html                 # 启动画面
│   ├── embed-worker.cjs            # Embedding worker 线程（模型加载 + 推理，避免阻塞主进程）
│   ├── updater.ts                  # 自动更新
│   ├── crash-reporter.ts           # 崩溃报告
│   └── ipc/                        # IPC 处理器（8 个模块）
│       ├── database.ts             # 数据库 CRUD
│       ├── llm.ts                  # LLM 调用 + 流式输出
│       ├── knowledge.ts            # 知识库 RAG 查询 + 文档管理
│       ├── file.ts                 # 文件读取 + PDF 导出
│       ├── workflow.ts             # 偏差工作流
│       ├── auditbee.ts             # AuditBee 集成
│       ├── template.ts             # 模版管理
│       └── notification.ts         # 飞书通知集成
│
├── src/                            # React 渲染进程
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 路由 + 布局
│   ├── index.css                   # Tailwind CSS v4 + 设计令牌
│   ├── pages/                      # 5 个页面
│   │   ├── AgentPage.tsx           # 智能助手（核心工作流页面）
│   │   ├── ReportsPage.tsx         # 报告列表 + 查看 + PDF 导出
│   │   ├── KnowledgePage.tsx       # 知识库管理（法规文档上传/搜索/删除）
│   │   ├── SettingsPage.tsx        # 设置（LLM Provider、API Key、飞书）
│   │   └── NotFoundPage.tsx
│   ├── components/                 # 公共组件
│   │   ├── ui/                     # 基础 UI 组件 (Button, Input, Card, Badge, etc.)
│   │   ├── chat/                   # 聊天相关组件
│   │   │   ├── ChatStream.tsx      # 聊天流
│   │   │   ├── ChatInput.tsx       # 输入框 + 快速操作
│   │   │   ├── ChatMessage.tsx     # 消息气泡
│   │   │   ├── ChatHistory.tsx     # 历史对话侧边栏
│   │   │   └── WorkflowProgress.tsx # 工作流进度可视化
│   │   ├── document/               # 文档相关组件
│   │   │   ├── DocumentViewer.tsx  # 报告查看器
│   │   │   └── ReportDiff.tsx      # 报告对比
│   │   ├── settings/               # 设置组件
│   │   │   ├── LLMConfig.tsx       # LLM 配置
│   │   │   ├── FeishuConfig.tsx    # 飞书配置
│   │   │   └── TemplateManager.tsx # 模版管理
│   │   ├── layout/                 # 布局组件
│   │   │   ├── Sidebar.tsx         # 左侧导航
│   │   │   └── Header.tsx          # 顶部栏
│   │   └── ErrorBoundary.tsx       # 错误边界
│   ├── hooks/                      # 自定义 Hooks
│   │   ├── useDeviationWorkflow.ts # 工作流控制
│   │   ├── useLLMStream.ts         # LLM 流式输出
│   │   ├── useDebounce.ts          # 防抖
│   │   ├── useAuditBee.ts          # AuditBee 集成
│   │   └── useToast.ts             # Toast 提示
│   ├── providers/                  # Context Providers
│   │   ├── ToastProvider.tsx       # Toast 上下文
│   │   └── ThemeProvider.tsx       # 主题上下文
│   ├── services/
│   │   └── api.ts                  # IPC 调用封装
│   ├── config/
│   │   └── constants.ts            # 导航项等常量
│   └── lib/
│       ├── utils.ts                # 工具函数
│       └── logger.ts               # 渲染进程日志
│
├── core/                           # 共享核心逻辑
│   ├── workflow/                   # XState 工作流
│   │   ├── deviation-machine.ts    # 偏差生成状态机（7 步流程）
│   │   ├── types.ts                # 工作流类型
│   │   ├── report-types.ts         # 自动生成的报告类型
│   │   ├── assembler.ts            # 模块组装器（4 阶段并行）
│   │   ├── module-utils.ts         # 模块工具函数
│   │   ├── report-to-markdown.ts   # 报告转 Markdown
│   │   ├── predictor.ts            # 偏差预测模块
│   │   ├── modules/                # 7 个报告模块生成器
│   │   │   ├── base.ts             # 基础生成器
│   │   │   ├── cover.ts            # 封面
│   │   │   ├── background.ts       # 背景
│   │   │   ├── investigation.ts    # 调查
│   │   │   ├── conclusion.ts       # 结论
│   │   │   ├── risk-assessment.ts  # 风险评估
│   │   │   ├── capa.ts             # CAPA
│   │   │   └── attachments.ts      # 附件
│   │   └── nodes/                  # 4 个工作流节点
│   │       ├── clue-analysis.ts    # 线索分析
│   │       ├── factor-identify.ts  # 5M1E 因素识别
│   │       ├── regulation-match.ts # 法规匹配（RAG）
│   │       └── report-generate.ts  # 报告生成
│   │
│   ├── llm/                        # LLM 调用层
│   │   ├── provider.ts             # 9 个 Provider 配置
│   │   ├── caller.ts               # 4 个高层操作 + 重试逻辑
│   │   └── prompts/                # Prompt 模板
│   │       ├── loader.ts           # 模板加载器
│   │       ├── schema-to-prompt.ts # Schema → 中文 JSON 示例
│   │       ├── clue-analysis.txt
│   │       ├── factor-identify.txt
│   │       ├── regulation-match.txt
│   │       └── report-generate.txt
│   │
│   ├── rag/                        # RAG 检索层
│   │   ├── index.ts                # 共享 retriever 单例
│   │   ├── embedder.ts             # Embedding 生成（本地 + 云端）
│   │   ├── chunker.ts              # 文档分块
│   │   ├── store.ts                # sqlite-vec 向量存储
│   │   └── retriever.ts            # 组合层 + 查询缓存
│   │
│   ├── db/                         # 数据库层
│   │   ├── connection.ts           # SQLite 连接管理（WAL 模式）
│   │   ├── schema.ts               # 完整 CRUD
│   │   └── migrations/
│   │       ├── 001_init.sql        # 初始表结构
│   │       ├── 002_add_risk_level.sql
│   │       ├── 003_add_deviation_type.sql
│   │       ├── 004_add_audit_tasks.sql
│   │       └── 005_conversations.sql # 对话历史
│   │
│   ├── template/                   # 模版系统
│   │   ├── index.ts                # 导出
│   │   ├── loader.ts               # 模版加载器（热重载）
│   │   ├── parser.ts               # Markdown 模版解析器
│   │   └── types.ts                # 模版类型
│   │
│   ├── i18n/                       # 国际化
│   │   └── index.ts                # 中英文支持
│   │
│   ├── pdf/                        # PDF 生成
│   │   ├── generator.ts            # react-pdf renderToBuffer
│   │   └── templates/
│   │       └── DeviationReport.tsx  # 偏差报告 PDF 模板
│   │
│   ├── word/                       # Word 模板填充（工厂模板单一真相源）
│   │   ├── filler.ts               # 占位符填充 + 模块插入点
│   │   └── __tests__/template-structure.test.ts  # 模板结构锁定（标题顺序/样式/页眉）
│   │
│   ├── schema/                     # Schema 定义
│   │   └── deviation-report-schema.json
│   │
│   ├── integration/                # AuditBee 集成
│   │   ├── feishu-client.ts        # 飞书 API 客户端
│   │   └── types.ts                # 数据类型
│   │
│   └── utils/                      # 工具函数
│       ├── logger.ts               # 结构化日志
│       ├── paths.ts                # 路径解析
│       ├── metrics.ts              # 性能指标
│       ├── file-reader.ts          # 文件读取
│       └── secure-storage.ts       # 安全存储（keytar）
│
├── scripts/                        # 工具脚本
│   ├── codegen-types.ts            # 从 Schema 生成 TypeScript 类型
│   ├── prepare-word-template.cjs   # 工厂模板 → fillable 占位符版（build 自动执行）
│   ├── copy-worker.cjs             # embed-worker.cjs 复制到 dist-electron/main
│   ├── e2e-fidelity.ts             # 真实 LLM 对照验证脚本
│   ├── download-embedding-model.ts # 本地 embedding 模型下载
│   └── build-knowledge.ts          # 内置法规文档预处理
│
├── e2e/                            # Playwright 端到端测试
│   ├── packaged.spec.ts            # 打包版 e2e（7 测试：启动/RAG/LLM/工作流/导出）
│   ├── theme.spec.ts               # 主题持久化
│   └── pages/                      # dev 模式页面交互（agent/reports/knowledge/settings）
│
├── knowledge/                      # 法规知识库
│   ├── builtin/                    # 55 个内置法规文件
│   │   ├── gmp_china_ch01.txt ~ ch14.txt  # 中国 GMP 14 章
│   │   ├── eu_gmp_annex*.txt        # EU GMP 附件
│   │   ├── ich_q*.txt              # ICH 指南
│   │   └── ...
│   └── user/                       # 用户上传的法规文档
│
├── docs/                           # 项目文档
│   ├── project-structure.md        # 本文件
│   ├── architecture.md             # 架构设计
│   ├── api.md                      # API 文档
│   ├── user-guide.md               # 用户指南
│   ├── template-structure-analysis.md  # 偏差模板结构分析
│   └── templates/                  # 偏差模板
│       ├── cover.md
│       ├── background.md
│       ├── investigation-root-cause.md
│       ├── conclusion.md
│       ├── risk-assessment.md
│       └── capa.md
│
├── config/                         # 配置文件
│   ├── .env                        # 环境变量（已被 .gitignore 排除）
│   └── .env.example                # 环境变量模板
│
└── resources/                      # 静态资源
    ├── fonts/                      # 中文字体（PDF 生成用）
    ├── icons/                      # 应用图标
    └── templates/
        └── deviation-report-fillable.docx  # Word 输出模板（占位符版，构建生成）
```

## IPC 模块（8 个）

| 模块 | 文件 | 功能 |
|------|------|------|
| database | database.ts | Settings/Reports/KnowledgeDocs/Conversations CRUD |
| llm | llm.ts | LLM 调用 + 流式输出 + Provider 管理 |
| knowledge | knowledge.ts | 知识库 RAG 查询 + 文档管理 |
| file | file.ts | 文件读取 + PDF 导出 |
| workflow | workflow.ts | 偏差工作流控制 |
| auditbee | auditbee.ts | AuditBee 集成 |
| template | template.ts | 模版管理 |
| notification | notification.ts | 飞书通知集成 |

## 页面（5 个）

| 页面 | 文件 | 功能 |
|------|------|------|
| AgentPage | AgentPage.tsx | 智能助手（核心工作流页面） |
| ReportsPage | ReportsPage.tsx | 报告列表 + 查看 + PDF 导出 |
| KnowledgePage | KnowledgePage.tsx | 知识库管理 |
| SettingsPage | SettingsPage.tsx | 设置（LLM Provider、飞书） |
| NotFoundPage | NotFoundPage.tsx | 404 页面 |

## 工作流（7 步）

```
Input → Analyze → Identify → Match → Generate → Review → Done
  │        │         │         │         │         │
  │        │         │         │         │         └─ 审查 Agent
  │        │         │         │         └─ 4 阶段并行生成 7 个模块
  │        │         │         └─ RAG 法规匹配
  │        │         └─ 5M1E 因素识别
  │        └─ 线索分析
  └─ 用户输入
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
  content TEXT NOT NULL,
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
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'regulation',
  chunk_count INTEGER DEFAULT 0,
  indexed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 审计任务表
CREATE TABLE audit_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  auditbee_task_id INTEGER,
  status TEXT DEFAULT 'pending',
  findings_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 对话历史表
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 工作流检查点表（崩溃恢复）
CREATE TABLE workflow_checkpoints (
  correlation_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
