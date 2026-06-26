# 剩余任务 TODO List

## 高优先级

### TODO-9: LLM 输入长度限制
**问题**: llm:generate 和 llm:stream 无长度限制
**实施方案**:
1. 在 `electron/ipc/llm.ts` 添加 `MAX_PROMPT_LENGTH = 100_000` 常量
2. 在 `llm:generate` 和 `llm:stream` 处理器中检查 `params.prompt.length`
3. 超限时返回 `{ success: false, error: '输入内容过长（最多 100,000 字符）' }`
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 15 分钟

---

### TODO-17: 本地 Embedding 批处理
**问题**: LocalEmbeddingProvider.embed() 逐条处理，性能差
**实施方案**:
1. 修改 `core/rag/embedder.ts` 的 `LocalEmbeddingProvider.embed()` 方法
2. 使用 `@huggingface/transformers` 的批处理 API
3. 将所有文本一次性传给 pipeline，而非逐条调用
**验证**: `npm run typecheck && npm run test`
**复杂度**: 中
**预计时间**: 30 分钟
**问题**: 需要确认 @huggingface/transformers 的批处理 API 是否支持多文本输入

---

### TODO-25-26: 数据库索引和分页
**问题**: getReports 无分页参数
**实施方案**:
1. 修改 `electron/ipc/database.ts` 的 `db:getReports` 处理器
2. 添加 `limit` 和 `offset` 参数
3. 传递给 `getReports()` 函数
4. 更新 `src/services/api.ts` 的 `reportApi.list()` 方法
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 20 分钟
**问题**: 默认分页参数应该是多少？（建议 limit=50, offset=0）

---

## 中优先级

### TODO-28: 模版管理 UI
**问题**: 后端完整但前端无入口
**实施方案**:
1. 在 `src/pages/SettingsPage.tsx` 添加"模版管理"标签页
2. 创建 `src/components/settings/TemplateManager.tsx` 组件
3. 显示模版列表（标题、字段数、最后修改时间）
4. 支持查看模版内容（只读）
5. 支持编辑模版内容
6. 支持重置为默认模版
**验证**: `npm run typecheck && npm run test:e2e`
**复杂度**: 高
**预计时间**: 2-3 小时
**问题**:
- 是否需要调用 skill 来制作 UI？
- 模版编辑器需要语法高亮吗？
- 需要实时预览功能吗？

---

### TODO-29: 使用 timed() 工具函数
**问题**: 手动 Date.now() 计时重复
**实施方案**:
1. 在 `core/llm/caller.ts` 的 `callLLMWithRetry` 中使用 `timed()`
2. 在 `core/rag/embedder.ts` 的 embed 方法中使用 `timed()`
3. 在 `core/rag/retriever.ts` 的 retrieve 方法中使用 `timed()`
4. 在 `core/pdf/generator.ts` 的 generatePdf 中使用 `timed()`
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 30 分钟
**问题**: timed() 函数是否已经实现？需要检查

---

### TODO-30: 日志格式统一
**问题**: 控制台和文件日志格式不一致
**实施方案**:
1. 统一 `core/utils/logger.ts` 的 `formatEntry` 函数
2. 控制台和文件使用相同格式：`timestamp [LEVEL] [module] message {data}`
3. 或者文件使用 JSON Lines 格式便于工具解析
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 20 分钟
**问题**: 你倾向于哪种格式？
- 方案 A: 统一为 `timestamp [LEVEL] [module] message {data}`
- 方案 B: 文件使用 JSON Lines 格式

---

## 低优先级

### TODO-31: 移除未使用的依赖
**问题**: 9 个未使用的依赖增加包体积
**实施方案**:
1. 审查以下依赖是否真的未使用：
   - `@ai-sdk/anthropic`
   - `@ai-sdk/react`
   - `@gsap/react`
   - `@radix-ui/react-dialog`
   - `@xstate/react`
   - `mammoth`
   - `pdf-parse`
   - `sqlite-vec`
   - `xlsx`
2. 移除确认未使用的依赖
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 30 分钟
**问题**: 这些依赖可能在某些场景下使用，需要仔细检查

---

### TODO-32: healthCheckAllProviders 并行化
**问题**: 串行执行所有 Provider 健康检查
**实施方案**:
1. 修改 `core/llm/provider.ts` 的 `healthCheckAllProviders` 函数
2. 使用 `Promise.allSettled` 并行检查
3. 收集所有结果后返回
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 15 分钟

---

### TODO-33: 多文件附件并行处理
**问题**: 工作流附件串行处理
**实施方案**:
1. 修改 `electron/ipc/workflow.ts` 的 `processAttachedFiles` 函数
2. 使用 `Promise.all` 并行处理多个文件
3. 添加错误处理（单个文件失败不影响其他文件）
**验证**: `npm run typecheck && npm run test`
**复杂度**: 低
**预计时间**: 20 分钟

---

## 执行顺序建议

1. **TODO-9** (15 分钟) - 简单，立即实施
2. **TODO-25-26** (20 分钟) - 简单，立即实施
3. **TODO-32** (15 分钟) - 简单，立即实施
4. **TODO-33** (20 分钟) - 简单，立即实施
5. **TODO-29** (30 分钟) - 需要检查 timed() 函数
6. **TODO-30** (20 分钟) - 需要确认格式
7. **TODO-17** (30 分钟) - 需要确认 API
8. **TODO-31** (30 分钟) - 需要仔细检查
9. **TODO-28** (2-3 小时) - 需要 UI 设计

## 总预计时间

- 高优先级: 65 分钟
- 中优先级: 2.5-3.5 小时
- 低优先级: 65 分钟
- **总计**: 约 4-5 小时
