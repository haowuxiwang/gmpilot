# GMPilot - 头脑风暴文档

> 制药行业GMP偏差生成工具
>
> 文档创建日期：2026-06-02
> 最后更新：2026-06-03（v2: AuditBee 集成方案确认）

---

## 一、项目概述

### 1.1 项目名称

**GMPilot** - GMP + Pilot（领航员）

寓意：帮助QA在偏差处理中"领航"，简洁好记，专业感强。

### 1.2 项目定位

**智能工作流（Intelligent Workflow）** - 不是AI Agent

```
不是Agent（自主决策、动态规划）
而是Workflow（预定义流程、确定性执行）+ LLM增强（智能填充）
```

**核心价值**：制药行业偏差撰写者的个人效率工具

**技术本质**：提示词工程 + 上下文工程 + Harness Engineering（不训练模型）

**与 AuditBee 的关系**：GMPilot 生成偏差报告 → AuditBee 审计报告合规性 → 形成完整闭环。两者共享法规知识库格式、LLM Provider 配置、数据模型枚举。详见 [docs/integration.md](docs/integration.md)。

**愿景**：开源改变制药行业闭塞的软件生态

### 1.3 目标用户

- 偏差调查的主要人员（需要撰写偏差的人）
- QA（质量保证）人员
- 生产管理人员

### 1.4 解决的问题

- 制药企业需要处理大量GMP偏差（生产过程中偏离标准的情况）
- 偏差报告编写耗时、重复、需要专业知识
- 希望用AI辅助生成偏差报告初稿

---

## 二、功能需求

### 2.1 偏差类型

覆盖所有偏差类型：
- 生产工艺偏差
- 设备故障偏差
- 环境监测偏差
- 物料偏差
- 人员操作偏差

### 2.2 输入方式

**多格式文件上传：**
- 文字描述（直接输入）
- 图片（现场照片，需要OCR识别）
- Word文档（线索文件）
- PDF文件（线索文件、偏差模版）

**OCR方案：**
- 使用OCR技术识别图片中的文字
- 不依赖多模态LLM（用户不一定是多模态模型）

### 2.3 输出方式

- PDF格式偏差报告
- 按照公司提供的模版输出
- 支持用户预览、编辑后导出

### 2.4 GMP语料库

**来源：** 法规文件
- 中国GMP
- FDA指南
- EU GMP

**实现方式：** RAG（检索增强生成）

---

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron + React                        │
├─────────────────────────────────────────────────────────────┤
│  UI层：React组件                                            │
│  ├── 线索输入（文字、文件上传）                              │
│  ├── 模版选择                                               │
│  ├── 报告预览                                               │
│  └── 设置配置                                               │
├─────────────────────────────────────────────────────────────┤
│  Workflow层：XState状态机                                    │
│  ├── 定义偏差生成流程（Step 1 → 2 → 3 → 4 → 5）            │
│  ├── 状态转换可预测、可追溯、可调试                          │
│  └── 支持暂停/恢复（Human-in-the-loop）                     │
├─────────────────────────────────────────────────────────────┤
│  AI层：Vercel AI SDK                                        │
│  ├── 统一接口调用OpenAI/Anthropic/本地模型                   │
│  ├── 结构化输出（JSON Schema）                              │
│  ├── 流式生成（用户体验好）                                  │
│  └── 工具调用（文件解析、RAG检索）                           │
├─────────────────────────────────────────────────────────────┤
│  存储层：本地文件 + SQLite                                   │
│  ├── 用户偏好、配置                                         │
│  ├── 模版库                                                 │
│  └── 法规知识库（RAG）                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈选择

| 层级 | 技术选择 | 理由 |
|------|----------|------|
| **桌面应用壳** | Electron | 成熟稳定，跨平台（Jan.ai 42.8K stars 验证） |
| **前端UI** | React 18 + TypeScript | 生态成熟，类型安全 |
| **UI组件库** | Ant Design 5 | 企业级组件，中文支持好 |
| **Workflow引擎** | XState | 29.6K stars，statelyai/agent 官方验证 XState+Vercel AI SDK 组合 |
| **LLM调用** | Vercel AI SDK | 24.6K stars，40+ Provider，流式输出，结构化输出（JSON Schema） |
| **状态管理** | XState + React Context | XState管理工作流，Context管理全局状态 |
| **文件解析** | pdf-parse, mammoth, tesseract.js | PDF、Word、OCR解析 |
| **向量存储** | sqlite-vec + better-sqlite3 | 7.7K stars，WASM，统一存储层（调研对比5个方案后确认） |
| **PDF生成** | react-pdf (@react-pdf/renderer) | 16.6K stars，React组件写PDF，中文嵌入字体（调研对比4个方案后确认） |
| **本地Embedding** | BAAI/bge-large-zh-v1.5 | 中文优化，1024维，AuditBee 验证可行 |
| **打包分发** | Electron Builder | 成熟的 extraResources 支持，可打包 Python 后端（如需） |

### 3.3 核心工作流

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Step 1  │───▶│  Step 2  │───▶│  Step 3  │───▶│  Step 4  │───▶│  Step 5  │
│ 线索输入  │    │ 线索分析  │    │ 5M1E识别 │    │ 法规匹配  │    │ 报告生成  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
  用户提供        LLM提取        LLM分类         RAG检索        LLM生成
  (确定性)       (LLM增强)      (LLM增强)       (确定性)       (LLM增强)
```

**XState状态机定义（伪代码）：**

```typescript
const deviationMachine = createMachine({
  id: 'deviation',
  initial: 'input',
  states: {
    input: { on: { SUBMIT: 'analyzing' } },
    analyzing: { invoke: { src: 'analyzeClue', onDone: 'identifying' } },
    identifying: { invoke: { src: 'identify5M1E', onDone: 'retrieving' } },
    retrieving: { invoke: { src: 'retrieveRegulations', onDone: 'generating' } },
    generating: { invoke: { src: 'generateReport', onDone: 'review' } },
    review: { on: { APPROVE: 'export', REVISE: 'generating' } },
    export: { invoke: { src: 'exportPDF', onDone: 'done' } },
    done: { type: 'final' }
  }
});
```

### 3.4 文件处理流程

```
用户上传文件
      │
      ▼
┌─────────────────────────────────────────┐
│           File Parser Service           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  PDF    │ │  Word   │ │  Image  │  │
│  │ Parser  │ │ Parser  │ │  OCR    │  │
│  └─────────┘ └─────────┘ └─────────┘  │
└─────────────────────────────────────────┘
      │
      ▼
   纯文本线索
      │
      ▼
   LLM分析
```

**OCR方案：**
- 使用 tesseract.js 进行本地OCR识别
- 支持中文识别
- 离线可用，不依赖云端服务

### 3.5 RAG实现方案

**组合式架构（非重型 RAG 框架）：**

```
法规文件（中国GMP、FDA、EU GMP + 用户上传）
            │
            ▼
┌─────────────────────────────────────────┐
│           Document Processor            │
│  • PDF解析（pdf-parse）                 │
│  • 文本切片（按章节/段落）               │
│  • 元数据提取（法规名称、章节号）        │
└─────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│     Embedding（本地优先）                │
│  • 默认：BAAI/bge-large-zh-v1.5        │
│  • 可选：OpenAI/Voyage API              │
│  • Vercel AI SDK embed()/embedMany()    │
└─────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│     sqlite-vec（向量存储）               │
│  • better-sqlite3 + @asg017/sqlite-vec  │
│  • 统一存储：向量 + 配置 + 模版          │
│  • 余弦相似度检索                        │
└─────────────────────────────────────────┘
            │
            ▼
   检索结果注入 LLM 上下文
   （Vercel AI SDK streamText/generateObject）
```

**不选重型 RAG 框架的理由：**
- LangChain.js（17.7K stars）：抽象过多，API 复杂，不适合轻量工具
- LlamaIndex.TS（3K stars）：社区小，更新慢
- LightRAG（36.1K stars）：Python-only，无法在纯 TS 项目中直接使用
- 组合式方案：Vercel AI SDK + sqlite-vec + 自定义分块，更轻量可控

### 3.6 多Provider统一接口

```typescript
// Vercel AI SDK的Provider抽象
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { ollama } from '@ai-sdk/ollama'; // 本地模型

// 统一调用
const provider = getProvider(userConfig); // 根据用户配置选择
const result = await generateText({
  model: provider('gpt-4o'), // 或 'claude-3-opus' 或 'llama3'
  messages: [...]
});
```

### 3.7 偏差模版系统

**模版来源：**
- 用户上传PDF/Word模版
- 系统解析模版结构
- 生成时按模版填充

**模版解析策略：**
- MVP阶段：结构化识别（LLM自动识别模版结构）
- 后续迭代：支持模版标记（用户手动标记填充位置，如{{偏差编号}}）

---

## 四、用户工作流

### 4.1 完整工作流

```
用户启动应用
      │
      ▼
选择/上传偏差模版
      │
      ▼
输入线索（文字 + 上传文件）
      │
      ▼
点击"生成偏差"
      │
      ▼
系统自动执行：
  1. 解析文件（OCR/文本提取）
  2. LLM分析线索
  3. 识别5M1E要素
  4. RAG检索相关法规
  5. 按模版生成报告
      │
      ▼
用户预览、编辑
      │
      ▼
导出PDF
```

### 4.2 5M1E分析框架

偏差分析基于"人机料法环"五个要素：

| 要素 | 英文 | 说明 |
|------|------|------|
| 人 | Man | 操作人员因素 |
| 机 | Machine | 设备设施因素 |
| 料 | Material | 原辅料因素 |
| 法 | Method | 工艺方法因素 |
| 环 | Environment | 生产环境因素 |

---

## 五、MVP功能清单

### 5.1 P0功能（核心）

| 功能 | 说明 |
|------|------|
| 文字输入线索 | 最基础的输入方式 |
| 文件上传 | 支持PDF、Word、图片（OCR识别） |
| 单一偏差模版 | 内置1个通用模版 |
| LLM生成偏差 | 支持多Provider（OpenAI、Anthropic、本地） |
| PDF导出 | 核心输出 |
| RAG法规知识库 | 法规文件检索增强 |
| AuditBee 数据对齐 | Finding/Report 类型枚举与 AuditBee 一致 |

### 5.2 P1功能（重要）

| 功能 | 说明 |
|------|------|
| 多模版支持 | 用户自定义模版 |
| 图片OCR增强 | 更好的中文识别 |
| 流式生成 | 实时显示生成过程 |
| 历史记录 | 保存生成历史 |
| **AuditBee 集成** | **生成报告后一键发送到 AuditBee 审计（本地 API 调用）** |

### 5.3 P2功能（增强）

| 功能 | 说明 |
|------|------|
| 多语言支持 | 中英文切换 |
| 模版市场 | 用户分享模版 |
| 企业版 | 多用户协作 |
| MCP 协议互通 | 两个项目暴露 MCP Server，被外部 Agent 调度 |

---

## 六、框架调研结果

### 6.1 调研的框架

| 框架 | Stars | 语言 | 适合 Electron+React | 多 LLM Provider | 社区活跃度 | 核心定位 |
|------|-------|------|---------------------|-----------------|-----------|----------|
| **Vercel AI SDK** | 24.6k | TypeScript | ★★★★★ | ★★★★★ (40+) | ★★★★★ | AI 应用开发工具包 |
| **Mastra** | 24.6k | TypeScript | ★★★★★ | ★★★★★ (40+) | ★★★★★ | AI Agent + 工作流框架 |
| **XState** | 29.6k | TypeScript | ★★★★★ | N/A (通用编排) | ★★★★☆ | 状态机/状态图/Actor |
| **LangChain.js** | 17.7k | TypeScript | ★★★★☆ | ★★★★★ | ★★★★★ | Agent 工程平台 |
| **Trigger.dev** | 15.1k | TypeScript | ★★★☆☆ | ★★★★☆ | ★★★★☆ | AI 工作流部署平台 |
| **n8n** | 190k | TypeScript | ★★☆☆☆ | ★★★★★ | ★★★★★ | 可视化工作流自动化 |
| **Flowise** | 53k | TypeScript | ★★☆☆☆ | ★★★★☆ | ★★★★★ | 可视化 AI Agent 构建 |
| **Coze Studio** | 20.8k | TypeScript | ★★☆☆☆ | ★★★★☆ | ★★★★☆ | AI Agent 开发平台 |
| **Inngest** | 5.4k | Go/TS | ★★☆☆☆ | ★★★☆☆ | ★★★☆☆ | 持久化工作流引擎 |

### 6.2 最终选择

**Vercel AI SDK + XState**

| 框架 | 角色 | 理由 |
|------|------|------|
| **Vercel AI SDK** | LLM调用层 | 24.6k stars，40+ Provider，React深度集成，API简洁 |
| **XState** | Workflow状态管理 | 29.6k stars，零依赖，可视化流程，可预测执行 |
| **Electron + React** | 桌面应用壳 | 成熟稳定，跨平台 |

### 6.3 为什么不选其他框架

| 框架 | 不选的理由 |
|------|-----------|
| **Mastra** | 功能全但可能过重，代表作品想展示自己的设计能力 |
| **LangChain.js** | API复杂，抽象过多，不适合轻量工具 |
| **Trigger.dev** | 服务端部署平台，不适合桌面应用 |
| **Inngest** | 服务端工作流引擎，不适合桌面应用 |
| **n8n/Flowise** | 独立Web平台，不是嵌入式库 |

---

## 七、待讨论问题

### 7.1 法规知识库来源

**已确认：内置核心 + 用户补充（方案 A+B）**

- 内置预处理好的核心法规（中国GMP 14章、FDA 21 CFR、EU GMP、ICH Q9/Q10）
- 支持用户上传补充法规文件（PDF/Word/TXT）
- 依据：AuditBee 验证了此模式可行（`graphrag_index/input/` 内置5个法规文件 + 用户上传）

**排除理由：**
- 纯用户上传（A）：新用户没有法规文件，体验差
- 自动下载（C）：FDA/EU 官网无稳定 API，版权风险

### 7.2 Embedding方案

**已确认：本地优先**

- 默认使用本地 Embedding 模型（离线可用，数据不出本地）
- 可选云端 API（OpenAI/Voyage Embedding，需联网）
- 依据：制药行业数据敏感，AuditBee 使用 `BAAI/bge-large-zh-v1.5` 本地模型验证可行
- 推荐模型：`BAAI/bge-large-zh-v1.5`（中文优化，1024维）或更轻量的 `BAAI/bge-small-zh-v1.5`

### 7.3 PDF生成方案

**已确认：react-pdf（@react-pdf/renderer）**

- 16.6K stars，React 组件定义 PDF 布局（JSX → PDF）
- 支持中文嵌入字体（GMP 报告必须）
- CSS-like 样式模型，匹配公司模版格式直观
- 依据：GMPilot 已选 React，react-pdf 提供最自然的开发体验

**排除理由：**
- PDFKit（10.6K stars）：底层 API，构建复杂布局代码量大
- Puppeteer HTML转PDF：需额外 Chromium，Electron 里增加 300MB+ 包体积
- html-pdf-node：底层也是 Puppeteer，同样问题

### 7.4 向量存储方案

**已确认：sqlite-vec（@asg017/sqlite-vec）**

- 7.7K stars，MIT 协议，C 语言核心 + WASM 构建
- 与 better-sqlite3 统一存储层（向量 + 配置 + 模版共用一个 SQLite 数据库）
- WASM 模式无 Electron 原生模块重建问题
- 支持余弦相似度、L2、内积检索
- 依据：调研中 5 个向量 DB 方案对比，sqlite-vec 综合评分最高

**排除理由：**
- vectra（618 stars）：社区小，stars 少 12 倍，功能类似但生态弱
- lancedb（10.5K stars）：Rust 原生模块，Electron 需 electron-rebuild，每次升级 Electron 版本都要重编译
- ChromaDB（28.2K stars）：JS 客户端需要 HTTP 服务器，不适合桌面应用
- nano-vectordb（203 stars）：Python-only，无 TypeScript 版本

---

## 八、技术可行性评估

### 8.1 值得做吗？

| 维度 | 评估 |
|------|------|
| **市场需求** | ✅ 制药行业合规需求刚性，偏差报告是必做项 |
| **技术可行性** | ✅ 文件解析+LLM生成，技术上成熟 |
| **竞争壁垒** | ⚠️ 需要GMP专业知识，但LLM降低了门槛 |
| **变现路径** | ⚠️ 开源为主，可以考虑增值服务 |
| **痛点真实性** | ✅ 偏差撰写是重复性高、耗时的工作 |
| **差异化** | ✅ 制药行业几乎没有开源工具 |
| **个人品牌** | ✅ 代表作品 + 开源影响力 |

### 8.2 潜在风险

| 风险 | 说明 | 应对策略 |
|------|------|----------|
| **合规风险** | AI生成的偏差报告能否通过药监局审查？ | 明确工具定位：辅助生成初稿，人工审核确认 |
| **数据敏感** | 企业是否愿意把偏差数据传到云端LLM？ | 支持本地模型，数据不出本地 |
| **专业门槛** | 需要足够的GMP知识来验证模型输出 | 开源社区协作，邀请行业专家参与 |

---

## 九、参考项目

### 9.1 类似项目

| 项目 | 定位 | 可借鉴点 |
|------|------|----------|
| **Jan.ai** | 本地LLM桌面应用 | Electron + React架构 |
| **Open Interpreter** | 代码执行Agent | 工具调用机制 |
| **Continue** | VS Code AI助手 | 上下文管理 |
| **Cursor/Windsurf** | AI IDE | Workflow + LLM集成 |

### 9.2 Electron + AI Agent 项目

| 项目 | Stars | 说明 |
|------|-------|------|
| **skalesapp/skales** | 1085 | 本地优先的桌面AI Agent |
| **ZYKJShadow/Async** | 483 | AI编码工作区 |
| **freestylefly/wesight** | 356 | 桌面AI Agent工作区 |

---

## 十、下一步计划

### 10.1 技术选型（已全部确认）

| 决策 | 结论 | 依据 |
|------|------|------|
| 法规知识库 | 内置核心 + 用户补充 | AuditBee 验证可行 |
| Embedding | 本地优先 | 制药数据敏感，BAAI/bge-large-zh-v1.5 |
| PDF生成 | react-pdf | 16.6K stars，React 组件写 PDF |
| 向量存储 | sqlite-vec | 7.7K stars，WASM，统一存储层 |

### 10.2 AuditBee 集成（已确认方向）

| 项目 | 状态 |
|------|------|
| 数据模型对齐（Finding/Report 枚举） | ✅ types.ts 已更新 |
| API 对接文档 | ✅ docs/integration.md 已创建 |
| 法规文件格式对齐 | ✅ knowledge/builtin/ 已有 16 个法规文件 |
| .env 变量名对齐 | ✅ config/.env.example 已使用 AGENT_LLM_PROVIDER |
| AuditBee API 客户端 | ✅ core/integration/auditbee-client.ts 完整实现 |
| AuditBee IPC + UI | ✅ electron/ipc/auditbee.ts + DeviationPage 集成 |

详见 [docs/integration.md](docs/integration.md)。

### 10.3 后续工作

1. ~~创建项目 CLAUDE.md~~ ✅
2. ~~设计详细的项目结构~~ ✅ docs/project-structure.md
3. ~~编写技术设计文档~~ ✅ brainstorming.md 已更新
4. ~~初始化项目脚手架~~ ✅ package.json、TypeScript、Vite、Electron
5. ~~类型定义对齐 AuditBee~~ ✅ core/workflow/types.ts
6. ~~集成方案设计~~ ✅ docs/integration.md
7. ~~复制 AuditBee 法规文件到 knowledge/builtin/~~ ✅ 16 个文件
8. ~~对齐 .env.example 变量命名~~ ✅
9. ~~实现 IPC 层~~ ✅ 6 个 IPC 模块 (database, llm, knowledge, file, workflow, auditbee)
10. ~~实现核心工作流节点~~ ✅ 4 个节点 + RAG 注入
11. ~~实现 RAG 层~~ ✅ chunker + embedder + store + retriever + index 单例
12. ~~实现 PDF 模板~~ ✅ react-pdf 模板 + 生成器
13. ~~实现 AuditBee API 客户端~~ ✅ 含一键审计方法
14. ~~Schema 动态化~~ ✅ deviation-report-schema.json + codegen + schema-to-prompt
15. ~~测试修复~~ ✅ 58 个测试全部通过

---

## 附录

### A. 关键术语

| 术语 | 说明 |
|------|------|
| **GMP** | Good Manufacturing Practice，药品生产质量管理规范 |
| **偏差** | 生产过程中偏离标准操作规程的情况 |
| **5M1E** | 人（Man）、机（Machine）、料（Material）、法（Method）、环（Environment） |
| **RAG** | Retrieval-Augmented Generation，检索增强生成 |
| **OCR** | Optical Character Recognition，光学字符识别 |
| **QA** | Quality Assurance，质量保证 |

### B. 项目名称备选

| 名称 | 含义 | 备注 |
|------|------|------|
| **GMPilot** | GMP + Pilot（领航员） | ✅ 最终选择 |
| **DeviGen** | Deviation + Generator | 备选 |
| **PharmaFlow** | Pharma + Flow | 备选 |
| **GMPStudio** | GMP + Studio | 备选 |
| **PharmaCraft** | Pharma + Craft | 备选 |

---

*文档结束*
