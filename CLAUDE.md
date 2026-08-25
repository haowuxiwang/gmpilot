# CLAUDE.md

GMPilot — 制药行业GMP偏差报告生成工具。Electron 桌面应用，TypeScript 全栈，基于 XState 工作流 + Vercel AI SDK + sqlite-vec。

## Tech Stack

### Desktop
- **Shell:** Electron 28 (main + renderer process)
- **Build:** Vite + @vitejs/plugin-react
- **Packaging:** Electron Builder

### Frontend (Renderer Process)
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS v4 + CSS custom properties (@theme tokens)
- **UI Primitives:** Radix UI (headless components) + CVA + clsx + tailwind-merge (shadcn/ui pattern)
- **Icons:** Lucide React
- **Animation:** GSAP + @gsap/react
- **Routing:** React Router v7
- **PDF Generation:** react-pdf (@react-pdf/renderer)
- **Build:** Vite

### Core Logic (Shared)
- **Workflow:** XState (StateGraph, deterministic routing)
- **LLM:** Vercel AI SDK (local + cloud, 9 Provider: deepseek/qwen/glm/openai/anthropic/siliconflow/openrouter/mimo/ollama)
- **RAG:** sqlite-vec (vector search) + better-sqlite3 (storage)
- **Embedding:** Local BAAI/bge-large-zh-v1.5 (default), OpenAI/Voyage (optional)

### Data
- **Database:** SQLite via better-sqlite3 (synchronous, Main Process)
- **Vector Store:** sqlite-vec (WASM, no native modules)
- **File Storage:** Local filesystem (data/ directory)

## Project Structure

```
gmpilot/
├── electron/           # Main process
│   ├── main.ts         # 入口
│   ├── preload.ts      # IPC 桥接
│   └── ipc/            # 7 个 IPC 模块 (database, llm, knowledge, file, workflow, auditbee, template)
├── src/                # Renderer process (React UI)
│   ├── pages/          # 5 个页面 (AgentPage, ReportsPage, KnowledgePage, SettingsPage, NotFoundPage)
│   ├── components/     # UI 组件 (chat/, document/, layout/, settings/, ui/, audit/)
│   ├── hooks/          # 自定义 hooks (useDeviationWorkflow, useLLMStream, useToast, useAuditBee)
│   ├── services/       # api.ts, auditbee-api.ts (IPC 调用封装)
│   ├── lib/            # 工具函数 (utils.ts, logger.ts)
│   └── config/         # constants.ts (导航项等常量)
├── core/               # Shared logic (所有业务逻辑)
│   ├── workflow/       # XState 状态机 + 7 个模块生成器
│   ├── llm/            # LLM Provider + Caller + Prompt 模板
│   ├── rag/            # RAG (chunker, embedder, store, retriever)
│   ├── db/             # SQLite (connection, schema, migrations)
│   ├── pdf/            # PDF 生成 (generator + templates)
│   ├── word/           # Word 模板填充 (filler + template-structure 测试)
│   ├── schema/         # deviation-report-schema.json (单一真相源)
│   ├── template/       # 模版系统 (loader, parser, types)
│   ├── integration/    # AuditBee API 客户端 + 类型
│   ├── utils/          # 工具函数 (logger, file-reader)
│   └── types/          # 共享类型定义 (ipc.ts)
├── scripts/            # codegen-types.ts (从 Schema 生成 TypeScript 类型)
├── knowledge/          # 法规文档 (builtin/ 16 个 + user/)
├── docs/               # 项目文档
├── config/             # .env 配置
└── resources/          # 静态资源 (fonts/)
```

See `docs/project-structure.md` for detailed directory layout.

## Key Patterns

### IPC Bridge Pattern
- Main process exposes APIs via `ipcMain.handle()`
- Renderer accesses via `window.gmpilot.*` (preload script)
- All database/file/LLM operations go through IPC
- No direct Node.js imports in renderer code

### XState Workflow Pattern
- Deterministic state machine for deviation generation
- 7 steps: Input → Analyze → Identify → Match → Generate → Review → Done
- Modular generation: 7 modules generated in 4 phases
- Each step invokes async services (LLM calls, RAG queries)
- Streaming support via Vercel AI SDK `streamText()`
- Error handling: each node has fallback behavior

### LLM Provider Pattern
- Vercel AI SDK unified provider abstraction
- `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider` packages
- Configurable via Settings page (API key, model, base URL)
- Structured output via `generateObject()` with JSON Schema

### RAG Pattern (Composable, not monolithic)
1. Document chunking (section-aware, by headings/paragraphs)
2. Embedding generation (local BAAI model via `@huggingface/transformers`)
3. Vector storage (sqlite-vec, cosine similarity search)
4. Retrieval → inject into LLM context

### Graceful Degradation
- LLM failure → template-based report (no crash)
- Embedding model missing → skip RAG, use keyword search
- sqlite-vec unavailable → in-memory fallback (dev mode only)

### Word Template Filling Pattern
- 工厂模板 `resources/templates/deviation-report-fillable.docx` 为唯一 Word 输出模板（单一真相源）
- `core/word/filler.ts` 通过 docx 占位符（`{{module_name}}`）填充，按模块插入点（编号标题）写入章节
- 模板结构由 `core/word/__tests__/template-structure.test.ts` 锁定（标题顺序/样式/页眉），改动模板必须同步更新断言
- 重新生成模板：`npm run build` 自动执行 `scripts/prepare-word-template.cjs`（工厂版式 → fillable 占位符版）
- 工厂模板变更 SOP 见 `docs/template-change-sop.md`

### Embedding Worker Pattern（打包版关键）
- onnxruntime-node 的 run() 同步阻塞调用线程，主进程直跑会卡死 UI/IPC
- `electron/embed-worker.cjs`（copy-worker.cjs 复制到 dist-electron/main/）承载模型加载 + 推理
- `core/rag/embedder.ts` 的 `WorkerEmbeddingProvider` 优先（不阻塞）；worker 文件缺失时回退主线程 `LocalEmbeddingProvider`
- 模型目录打包感知：`core/utils/paths.ts` 的 `getModelDirPath()`（打包 → exe 旁 model/ 或 resources/model/；dev → ./model）
- transformers.js 必须显式设置 `env.localModelPath` + `env.allowRemoteModels=false`（GMP 离线环境禁止远程下载）

## Development Commands

```bash
# Install dependencies
npm install

# Development
npm run dev              # Start Electron + Vite dev server
npm run dev:renderer     # Start only React dev server

# Build
npm run build            # Build for production
npm run build:win        # Build Windows installer
npm run build:mac        # Build macOS dmg

# Lint & Format
npm run lint             # ESLint check
npm run format           # Prettier format

# Type Check
npm run typecheck        # TypeScript type check

# Tests (4 层)
npm run test             # Vitest 单元+集成（789 测试，核心逻辑/LLM prompt/Word 模板）
npm run test:llm-e2e     # 真实 LLM 端到端（硅基流动 20 + 工作流 1，需 API key）
npm run test:e2e         # Playwright 渲染端 e2e（37 测试，dev 模式）
npm run test:packaged    # Playwright 打包版 e2e（7 测试：启动/RAG/LLM/工作流/导出，验证 release/win-unpacked）
```

## Testing（4 层体系）

| 层 | 命令 | 数量 | 作用 |
|---|---|---|---|
| 单元+集成 | `npm run test` (vitest) | 789 | 工作流状态机、LLM caller（含 JSON 解析重试）、RAG 检索、Word 模板结构断言、SQLite schema |
| 真实 LLM | `npm run test:llm-e2e` | 21 | 硅基流动 Qwen2.5-72B 全链路（9 provider 工厂/结构化输出/工作流 1 例） |
| 渲染 e2e | `npm run test:e2e` (playwright dev) | 37 | 5 页面交互、主题持久化、报告生成（真实 LLM）、PDF/Word 导出 |
| 打包版 e2e | `npm run test:packaged` (playwright) | 7 | 对 release/win-unpacked 真实二进制：启动、知识库 RAG 索引+语义检索、LLM 连接、完整报告生成、导出入口 |

要点：
- packaged e2e 验证打包关键路径（embedding worker 接线、模型路径打包感知、sqlite-vec native ABI），发布前必跑
- LLM/渲染 e2e 需 `config/.env` 中的 API key（测试专用 key 硬编码在 e2e/packaged.spec.ts）
- 打包版 e2e 使用独立临时数据目录（APP_DATA_DIR），不污染开发数据

## Code Style

- **TypeScript strict mode** — no `any` types
- **2-space indent** — consistent with React ecosystem
- **Single quotes** — for strings
- **Semicolons** — required
- **Arrow functions** — preferred over function declarations
- **Component naming:** PascalCase (e.g., `DeviationPage.tsx`)
- **File naming:** kebab-case for utilities (e.g., `clue-analysis.ts`)
- **Chinese comments** — for business logic explanation
- **English comments** — for technical implementation details

## Environment Variables

All in `config/.env` (see `config/.env.example`):
- `AGENT_LLM_PROVIDER` — Default provider (deepseek/qwen/glm/openai/anthropic/siliconflow/openrouter/mimo)
- `DEEPSEEK_API_KEY` / `QWEN_API_KEY` / `GLM_API_KEY` / ... — Provider API keys
- `DEEPSEEK_BASE_URL` / `QWEN_BASE_URL` / ... — Custom base URLs (optional)
- `DEEPSEEK_MODEL` / `QWEN_MODEL` / ... — Custom model names (optional)
- `EMBEDDING_PROVIDER` — local/openai/voyage
- `EMBEDDING_MODEL` — Model name for embedding
- `APP_DATA_DIR` — Data directory path
- `AUDITBEE_BASE_URL` — AuditBee server URL (default: http://localhost:8000)
- `LOG_LEVEL` — Log level (debug/info/warn/error)
