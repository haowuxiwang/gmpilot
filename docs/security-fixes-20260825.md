# 安全整改记录（2026-08-25）

对照 `final-production-todo.md` 的审查结论逐项核实与修复。本文档为该 TODO 的状态更新。

## 已修复

| 原问题 | 状态 | 说明 |
|---|---|---|
| P0 keytar 已归档 | ✅ 已完成 | `core/utils/secure-storage.ts` 使用 Electron `safeStorage`，无 keytar 依赖 |
| P1 xlsx v0.18.5 漏洞 | ✅ 已完成 | 文件解析已迁移到 exceljs（`core/utils/file-reader.ts`），xlsx 不在依赖中 |
| P1 `db:getReports` 缺参数验证 | ✅ 已完成 | IPC 层 limit(1-200)/offset(≥0) 校验；本次又新增 ReportSummary 列裁剪 |
| P1 报告列表 SELECT * 拉大文本列 | ✅ 本次修复 | 新增 `getReportSummaries()`（排除 content/clue_input/JSON 大列），列表页改用；查看/导出按 id 走 `getReport()` 全文 |
| P1 LLM baseUrl SSRF | ✅ 本次修复 | `core/llm/provider.ts` 新增 `validateBaseUrl()`：协议白名单（云端强制 https）、拒绝内网 IP/`.internal`/`.local`/元数据端点，localhost 仅限本地 provider（Ollama）或告警放行。9 个单测覆盖 |

## 遗留（低优先级）

| 问题 | 优先级 | 备注 |
|---|---|---|
| preload removeAllListeners 全局解绑 | P2 | 多组件同监听同一通道会互相干扰；当前 UI 单监听方，暂不阻塞 |
| workflow IPC override 与 machine 双实现 | ✅ 本次修复 | assembler 新增 `createDefaultGenerators()` 单一工厂，两条路径共用 |
