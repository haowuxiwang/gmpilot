# 调查结论 Investigation Conclusion

## 章节说明

本章节汇总调查结论，明确根本原因或最可能的原因。

## 可变字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| rootCause | 根本原因 | Root Cause | 长文本 | 最终确定的根本原因 |
| mostLikelyCause | 最有可能的原因 | Most Likely Cause | 长文本 | 如无法确定根本原因，列出最有可能的原因 |

## 生成提示

基于以下信息生成调查结论：
1. 根本原因调查结果（investigation.rootCause.conclusion）
2. 重复偏差调查结论（investigation.repeatDeviations.conclusion）
3. 其他产品调查结论（investigation.otherProducts.conclusion）

综合分析后，明确：
- 是否能确定根本原因
- 如果能，根本原因是什么
- 如果不能，最可能的原因是什么

## 输出格式

```json
{
  "rootCause": "最终确定的根本原因描述",
  "mostLikelyCause": "如无法确定根本原因，列出最有可能的原因"
}
```

## 注意事项

1. 根本原因应该是具体的、可验证的
2. 如果有多个可能的原因，应该列出最可能的一个
3. 结论应该基于调查证据，而非推测
