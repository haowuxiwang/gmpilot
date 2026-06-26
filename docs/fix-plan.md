# 审查问题修复计划

## P0（立即修复）

### FIX-1: 数据库降级后数据不一致
**问题**: `store.ts` 中 `insertBatch` 使用 `config.tableName`，`search` 使用 `activeTable`
**修复**: 统一使用 `activeTable`
**文件**: `core/rag/store.ts`

### FIX-2: API 层覆盖不完整
**问题**: 组件直接调用 `window.gmpilot`，绕过 API 层
**修复**: 封装缺失的 API 方法
**文件**: `src/services/api.ts`

## P1（尽快修复）

### FIX-3: regulation-match 使用 generateObject
**问题**: 使用 `generateText` + 手动 JSON 解析，脆弱
**修复**: 改用 `generateObject` + Zod schema
**文件**: `core/llm/caller.ts`

### FIX-4: 添加嵌入批量限制
**问题**: 大文档所有 chunks 一次性发送
**修复**: 添加批量处理（每批 10 个 chunks）
**文件**: `core/rag/retriever.ts`

### FIX-5: 添加 OpenAI provider 重试逻辑
**问题**: OpenAI provider 无重试
**修复**: 添加与 SiliconFlow 相同的重试机制
**文件**: `core/rag/embedder.ts`

### FIX-6: 修复 fallback 表数据不一致
**问题**: 降级后 insert 使用错误的表名
**修复**: 统一使用 `activeTable`
**文件**: `core/rag/store.ts`

## P2（计划修复）

### FIX-7: 添加 doc_id 索引
**问题**: fallback 表无索引
**修复**: 添加 `CREATE INDEX`
**文件**: `core/rag/store.ts`

### FIX-8: 修复 Prompt 模板硬编码
**问题**: regulation-match.txt 硬编码示例因素
**修复**: 添加 `{factors_json}` 占位符
**文件**: `core/llm/prompts/regulation-match.txt`

### FIX-9: 统一错误处理
**问题**: deleteDocument 忽略返回值
**修复**: 检查 `result.success`
**文件**: `src/pages/KnowledgePage.tsx`

---

## 测试计划

每个修复完成后：
1. `npm run typecheck` - TypeScript 检查
2. `npm run test` - 单元测试
3. 验证功能正常
