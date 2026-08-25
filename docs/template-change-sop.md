# 工厂模板变更 SOP（Standard Operating Procedure）

> 版本：v1.0 | 日期：2026-08-10
> 适用范围：GMPilot 的 Word 报告输出需要与工厂（客户）偏差报告模板保持一致的场景

## 背景

GMPilot 的 Word 输出遵循**单一真相源**原则：

```
工厂模板 deviation-report-factory.docx（客户提供的版式）
        │  scripts/prepare-word-template.cjs（构建时自动执行）
        ▼
resources/templates/deviation-report-fillable.docx（占位符版，应用实际使用）
        │  core/word/filler.ts（运行期填充）
        ▼
导出的偏差报告 .docx
```

模板结构由 `core/word/__tests__/template-structure.test.ts` 锁定（标题顺序、样式、页眉），改动模板必须同步更新断言，否则测试失败。

## 触发场景

1. 客户提供新版工厂模板（标题、章节顺序、版式变化）
2. 工厂模板的标题/编号/页眉/样式有调整
3. 需要新增或删除报告章节

## 操作步骤

### Step 1：获取新工厂模板

将客户提供的 docx 复制为 `resources/templates/deviation-report-factory.docx`（覆盖旧文件）。

### Step 2：分析模板结构

运行现有结构测试观察失败点：

```bash
npx vitest run core/word/__tests__/template-structure.test.ts
```

对照输出逐项核对：
- 12 个模块标题的顺序与编号（1 偏差背景 / 2 调查分析 / 3 结论 / ...）
- 标题样式（工厂用 Heading 1 加粗编号标题，非正文段落）
- 页眉（fileNo / 版本号 / 公司名）
- 无残留模板标签（`{{module_xxx}}` 之外的占位符）

### Step 3：调整 `scripts/prepare-word-template.cjs`

- 工厂模板 → fillable 模板的转换逻辑（插入点锚定、样式复制、占位符写入）
- 若章节插入点变化，同步修改插入点锚定逻辑
- 若模块标题编号变化，同步修改标题文本

### Step 4：重新生成 fillable 模板 + 更新断言

```bash
node scripts/prepare-word-template.cjs   # 重新生成 fillable 模板
```

同步更新 `core/word/__tests__/template-structure.test.ts` 的断言：
- 标题顺序数组（`expectedHeadings`）
- 页眉/样式断言
- 测试通过后再执行全量 vitest

### Step 5：Word 填充回归

```bash
npm run test    # 全量单元+集成（含 filler 相关）
npm run typecheck
npm run lint
```

用真实数据验证填充结果：
```bash
npx tsx scripts/e2e-fidelity.ts  # 或对现有 data/e2e-fidelity/*.json 跑填充脚本
```

### Step 6：端到端验证

```bash
npm run test:e2e         # dev 模式 Word 导出（playwright 37 测试）
npm run build:win
npm run test:packaged    # 打包版导出入口（7 测试）
```

## 常见陷阱

| 陷阱 | 后果 | 应对 |
|---|---|---|
| 工厂模板用了正文样式写标题 | 结构测试断言失败（非 Heading） | prepare-word-template 转换时复制编号 + 应用 Heading 样式 |
| 章节顺序与 schema 模块顺序不一致 | filler 插入错位 | 插入点锚定严格按编号标题匹配，不靠位置猜 |
| 页眉含动态字段（如页码变量） | 结构测试页眉断言失败 | 同步更新测试中的页眉期望值 |
| 直接改 fillable 模板而不是工厂模板 | 下次 build 被覆盖丢失 | 永远只改工厂模板，fillable 由脚本生成 |

## 验收标准

- [ ] 模板结构测试 4/4 通过
- [ ] vitest 全量 789 通过
- [ ] dev e2e 37 通过（Word 导出用例）
- [ ] packaged e2e 7 通过（导出入口）
- [ ] 导出 docx 与工厂模板版式目视一致（标题顺序、页眉、样式）
