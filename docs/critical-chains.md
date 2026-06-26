# GMPilot 关键链路文档

> 用于排查问题时快速定位数据流经过的文件和函数。

## 日志模块前缀

| 模块 | 前缀 | 文件 |
|------|------|------|
| 工作流 | `[Workflow]` | deviation-machine.ts, ipc/workflow.ts |
| LLM | `[LLM]` | caller.ts, provider.ts |
| RAG | `[RAG]` | retriever.ts, store.ts, embedder.ts |
| 数据库 | `[DB]` | connection.ts, schema.ts |
| PDF | `[PDF]` | generator.ts |
| AuditBee | `[AuditBee]` | auditbee-client.ts |
| 主进程 | `[Main]` | main.ts |

---

## 链路 1: 偏差报告生成（主链路）

```
用户输入 → IPC → XState → LLM×4 → RAG → 报告JSON → DB保存 → 前端预览 → PDF导出
```

| 步骤 | 文件 | 函数 | 日志 |
|------|------|------|------|
| 1. 用户输入 | DeviationPage.tsx | TextArea.onChange | — |
| 2. 触发工作流 | useDeviationWorkflow.ts | runWorkflow() | — |
| 3. IPC 调用 | preload.ts | workflow.runDeviation | — |
| 4. 初始化 | ipc/workflow.ts | initRetriever + 加载法规 | `[Workflow] RAG initialized` |
| 5. 创建状态机 | deviation-machine.ts | createDeviationMachine() | — |
| 6. LLM: 线索分析 | clue-analysis.ts → caller.ts | analyzeClueNode() | `[LLM] clue-analysis completed` |
| 7. LLM: 5M1E | factor-identify.ts → caller.ts | identifyFactorsNode() | `[LLM] factor-identify completed` |
| 8. RAG + LLM: 法规 | deviation-machine.ts → regulation-match.ts | matchRegulationsNode() | `[RAG] Regulation context ready` + `[LLM] regulation-match completed` |
| 9. LLM: 报告 | report-generate.ts → caller.ts | generateReportNode() | `[LLM] report-generate completed` |
| 10. 保存报告 | ipc/workflow.ts | createReport() | `[Workflow] Workflow completed` |
| 11. 前端预览 | ReportPreview.tsx | ReportPreview 组件 | — |
| 12. PDF 导出 | generator.ts | generatePdfToFile() | `[PDF] PDF saved` |

---

## 链路 2: LLM 调用链

```
caller.ts → provider.ts (DB→env) → createLLMModel() → Vercel AI SDK → generateObject()
```

| 环节 | 文件 | 日志 |
|------|------|------|
| Provider 选择 | provider.ts | `[LLM] Using provider: {name}` |
| 调用开始 | caller.ts | `[LLM] {operation} started` |
| 调用成功 | caller.ts | `[LLM] {operation} completed {duration}ms` |
| 重试 | caller.ts | `[LLM] {operation} retry {n}/{max}` |
| 认证失败 | caller.ts | `[LLM] Auth failed for provider {name}` |

4 个操作：`clue-analysis` / `factor-identify` / `regulation-match` / `report-generate`

---

## 链路 3: RAG 检索链

```
法规文件 → chunker → embedder → store.insertBatch
查询 → embedder → store.search → filter → getRegulationContext
```

| 环节 | 文件 | 日志 |
|------|------|------|
| 向量表初始化 | store.ts | `[RAG] Vector table initialized` 或 `[RAG] sqlite-vec not available, using fallback` |
| 文档索引 | retriever.ts | 通过 chunker 分块 + embedder 生成向量 + store.insertBatch 存储 |
| 查询开始 | retriever.ts | `[RAG] Searching: "{query}"` |
| 查询结果 | retriever.ts | `[RAG] Search completed: {results} results, best similarity: {score}` |
| 法规上下文 | retriever.ts | `[RAG] Regulation context ready: {chunks} chunks` |
| 无结果 | retriever.ts | `[RAG] No regulation context found` |

---

## 链路 4: AuditBee 集成链

```
前端 → IPC → reportToMarkdown → uploadDocument → createTask → runTask → waitForCompletion → getFindings
```

| 步骤 | 文件 | 日志 |
|------|------|------|
| 审计开始 | auditbee-client.ts | `[AuditBee] Starting audit: {title}` |
| 上传文档 | auditbee-client.ts | `[AuditBee] Document uploaded: docId={id}` |
| 创建任务 | auditbee-client.ts | `[AuditBee] Task created: {taskId}` |
| 执行任务 | auditbee-client.ts | `[AuditBee] Task started: {taskId}` |
| 完成 | auditbee-client.ts | `[AuditBee] Task completed: {taskId}` |
| 获取结果 | auditbee-client.ts | `[AuditBee] Audit finished: {findings} findings` |

---

## 链路 5: 数据库读写链

```
Settings: UI → IPC → setSettings(db) → SQLite UPSERT → getProviderConfig(db→env)
Reports: workflow → createReport(db) → SQLite INSERT → IPC → UI
```

| 环节 | 文件 | 日志 |
|------|------|------|
| DB 初始化 | connection.ts | `[DB] Database initialized: {path}, WAL mode` |
| Settings 写入 | schema.ts | 通过 setSettings() |
| Report 写入 | workflow.ts | `[Workflow] Workflow completed: {deviationId}` |

---

## 链路 6: PDF 生成链

```
DeviationReport → CoverPage + ContentPages → renderToBuffer → writeFileSync
```

| 步骤 | 文件 | 日志 |
|------|------|------|
| 生成开始 | generator.ts | `[PDF] Generating PDF: {deviationId}` |
| 渲染完成 | generator.ts | `[PDF] PDF rendered: {size}, {duration}ms` |
| 写入文件 | generator.ts | `[PDF] PDF saved: {filePath}` |
| 字体注册 | DeviationReport.tsx | `[PDF] Failed to register font` (仅失败时) |

---

## 排查指南

### 报告生成失败

1. 查看 `[Workflow] Workflow started` — 确认工作流启动
2. 查看 `[LLM]` 日志 — 确认哪个 LLM 操作失败
3. 查看 `[LLM] Auth failed` — 检查 API Key 配置
4. 查看 `[LLM] {operation} failed` — 检查错误详情

### RAG 法规检索无结果

1. 查看 `[RAG] Vector table initialized` — 确认向量表创建
2. 查看 `[RAG] Searching` — 确认查询已执行
3. 查看 `[RAG] Search completed: no results` — 确认无匹配
4. 检查 `knowledge/builtin/` 是否有法规文件

### PDF 导出失败

1. 查看 `[PDF] Generating PDF` — 确认生成开始
2. 查看 `[PDF] PDF rendered` — 确认渲染完成
3. 查看 `[PDF] Failed to register font` — 检查字体文件
4. 查看 `[PDF] PDF saved` — 确认文件写入

### AuditBee 审计失败

1. 查看 `[AuditBee] Starting audit` — 确认审计开始
2. 查看 `[AuditBee] Document uploaded` — 确认文档上传成功
3. 查看 `[AuditBee] Task created` — 确认任务创建
4. 查看 `[AuditBee] Task completed` — 确认任务完成
5. 如果无日志 — 检查 AuditBee 服务是否运行
