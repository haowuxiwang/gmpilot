# 风险分析及影响评估 Risks Analysis and Impact Assessment

## 章节说明

本章节评估偏差对各方面的潜在影响。

## 影响维度

| 字段 | 中文 | 英文 | 说明 |
|------|------|------|------|
| qualityImpact | 质量影响 | Quality Impact | 对产品质量的潜在影响 |
| stabilityImpact | 稳定性影响 | Stability Impact | 对产品稳定性的潜在影响 |
| registrationImpact | 注册文件影响 | Registration Impact | 对注册文件的影响 |
| customerImpact | 客户影响 | Customer Impact | 对客户的影响 |
| validationImpact | 验证有效性影响 | Validation Impact | 对验证有效性的影响 |

## 生成提示

基于以下信息生成风险评估：
1. 调查结论（conclusion）
2. 调查发现（findings）
3. 涉及的产品和批次

评估每个维度：
- 是否有影响
- 影响程度（高/中/低）
- 具体影响描述

## 输出格式

```json
{
  "qualityImpact": "对产品质量的潜在影响描述",
  "stabilityImpact": "对产品稳定性的潜在影响描述",
  "registrationImpact": "对注册文件的影响描述",
  "customerImpact": "对客户的影响描述",
  "validationImpact": "对验证有效性的影响描述"
}
```

## 评估标准

### 质量影响
- 高：可能导致产品不合格
- 中：可能影响产品质量
- 低：对产品质量影响可忽略

### 稳定性影响
- 高：可能影响产品稳定性
- 中：可能对稳定性有轻微影响
- 低：对稳定性无影响

### 注册文件影响
- 高：需要更新注册文件
- 中：可能需要更新注册文件
- 低：不需要更新注册文件

### 客户影响
- 高：可能影响客户使用
- 中：可能对客户有轻微影响
- 低：对客户无影响

### 验证有效性影响
- 高：可能影响验证有效性
- 中：可能对验证有效性有轻微影响
- 低：对验证有效性无影响
