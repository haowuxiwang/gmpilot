# 纠正预防措施 CAPA

## 章节说明

本章节记录针对偏差采取的纠正措施和预防措施。

## CAPA 表格字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| capaNo | CAPA编号 | CAPA No. | 文本 | CAPA系统编号 |
| content | 措施内容 | Content | 长文本 | 具体的纠正或预防措施 |
| executor | 执行人 | Executor | 文本 | 负责执行的人员 |
| expectedDate | 预期完成日期 | Expected Date | 日期 | 计划完成日期 |
| signatureDate | 执行人签字/日期 | Signature/Date | 签字+日期 | 执行确认 |

## 两个表格

1. **纠正措施表格** - 针对已发生问题的纠正
2. **预防措施表格** - 防止问题再次发生

## 生成提示

基于以下信息生成 CAPA：
1. 根本原因（conclusion.rootCause）
2. 风险评估结果（riskAssessment）
3. 调查发现（findings）

生成 CAPA 时：
- 每个根本原因对应至少一个 CAPA
- CAPA 应该具体、可执行、可验证
- 预期完成日期应该合理

## 输出格式

```json
{
  "corrections": [
    {
      "capaNo": "CAPA-001",
      "content": "纠正措施内容",
      "executor": "执行人",
      "expectedDate": "YYYY-MM-DD",
      "signatureDate": ""
    }
  ],
  "preventions": [
    {
      "capaNo": "CAPA-002",
      "content": "预防措施内容",
      "executor": "执行人",
      "expectedDate": "YYYY-MM-DD",
      "signatureDate": ""
    }
  ]
}
```

## CAPA 编号规则

- 纠正措施：CAPA-C-001, CAPA-C-002, ...
- 预防措施：CAPA-P-001, CAPA-P-002, ...

## 注意事项

1. CAPA 应该针对根本原因，而非表面现象
2. 措施应该具体、可执行
3. 预期完成日期应该合理
4. 执行人应该是相关负责人员
