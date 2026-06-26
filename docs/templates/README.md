# 偏差报告模版系统

## 概述

本目录包含偏差调查和风险评估报告的模版文件。每个模版定义了一个报告章节的结构、字段和生成规则。

## 模版文件列表

| 文件 | 章节 | 说明 |
|------|------|------|
| `cover.md` | 封面 | 固定模版 + 用户信息 |
| `background.md` | 背景 | 从线索提取基本信息 |
| `investigation-root-cause.md` | 根本原因调查 | LLM 生成调查内容 |
| `investigation-repeat.md` | 重复偏差调查 | LLM 生成 + 历史数据 |
| `investigation-other.md` | 其他产品调查 | LLM 生成 |
| `conclusion.md` | 调查结论 | LLM 生成 |
| `risk-assessment.md` | 风险分析 | LLM 生成 |
| `capa.md` | CAPA | LLM 生成 |

## 模版结构

每个模版文件包含以下部分：

1. **章节说明** - 章节的用途和目的
2. **可变字段** - 需要填充的字段定义
3. **生成提示** - LLM 生成时的指导
4. **输出格式** - JSON 输出格式示例
5. **注意事项** - 特殊要求和约束

## 模版更新

模版文件支持热更新：
- 修改模版文件后，下次生成报告时会自动使用新模版
- 无需重启应用
- 建议在修改后测试生成效果

## 使用方式

1. 模版由 `core/template/loader.ts` 加载
2. 模版由 `core/template/parser.ts` 解析
3. 各章节生成器使用模版指导 LLM 生成内容
4. 最后由 `core/workflow/assembler.ts` 组装成完整报告

## 添加新模版

1. 在本目录创建新的 `.md` 文件
2. 按照现有模版的格式编写
3. 在 `core/workflow/modules/` 中创建对应的生成器
4. 在 `assembler.ts` 中添加组装逻辑
