# GMPilot

制药行业 GMP 偏差报告生成工具。基于 AI 的智能工作流，帮助 QA 人员快速生成专业的偏差报告。

## 核心特性

- **智能工作流**：XState 状态机驱动的 7 步偏差生成流程（输入→分析→因素→法规→生成→审核→完成）
- **多 LLM Provider**：支持 9 个提供商（DeepSeek、通义千问、智谱、OpenAI、Anthropic、SiliconFlow、OpenRouter、Mimo、Ollama）
- **法规知识库**：内置中国 GMP 14 章 + ICH Q9/Q10 + RAG 向量检索
- **模版系统**：6 个独立模版模块，支持单独生成和合并
- **PDF 导出**：react-pdf 生成专业的偏差报告 PDF
- **多格式支持**：支持 txt、pdf、docx、xlsx 文件解析

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面应用 | Electron 28 |
| 前端 | React 18 + TypeScript + Tailwind CSS + Radix UI (shadcn/ui) |
| 工作流 | XState 5 |
| LLM 调用 | Vercel AI SDK |
| 向量存储 | sqlite-vec + better-sqlite3 |
| PDF 生成 | react-pdf |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp config/.env.example config/.env
# 编辑 config/.env，填入 API Key

# 启动开发
npm run dev

# 构建
npm run build
```

## 配置说明

在 `config/.env` 中配置 LLM Provider：

```bash
# 统一配置模式（推荐）
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL=deepseek-ai/DeepSeek-V3.2

# 或分 Provider 配置
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

## 项目结构

```
gmpilot/
├── electron/           # Electron 主进程
│   ├── main.ts         # 入口
│   ├── preload.ts      # IPC 桥接
│   └── ipc/            # 7 个 IPC 模块
├── src/                # React 渲染进程
│   ├── pages/          # 5 个页面
│   ├── components/     # UI 组件
│   ├── hooks/          # 自定义 hooks
│   └── services/       # API 服务层
├── core/               # 共享核心逻辑
│   ├── workflow/       # XState 工作流 + 模块生成器
│   ├── llm/            # LLM Provider + Prompt 模板
│   ├── rag/            # RAG 管道
│   ├── db/             # SQLite 数据库
│   ├── pdf/            # PDF 生成
│   └── template/       # 模版系统
├── knowledge/          # 法规知识库（16 个内置文件）
├── docs/               # 项目文档
├── config/             # 配置文件
└── data/               # 运行时数据
```

详见 [docs/project-structure.md](docs/project-structure.md)。

## 开发命令

```bash
npm run dev              # 启动开发
npm run build            # 构建生产版本
npm run typecheck        # TypeScript 类型检查
npm run test             # 运行单元测试
npm run test:e2e         # 运行 E2E 测试
npm run lint             # ESLint 检查
npm run format           # Prettier 格式化
npm run codegen          # 从 Schema 生成 TypeScript 类型
```

## 许可证

MIT License
