# 根本原因调查 Root Cause Investigation

## 章节说明

本章节记录根本原因调查的完整过程，包括各项调查结果和分析方法。

## 调查过程记录字段

| 字段 | 中文 | 英文 | 说明 |
|------|------|------|------|
| interviews | 人员面谈记录 | Interviews | 培训、SOP执行、责任心等 |
| sopReview | SOP核查结果 | SOP Review | 工艺规程、岗位操作法清晰度 |
| historicalData | 历史数据回顾 | Historical Data | 分析方法、验证报告、年度回顾等 |
| relatedBatches | 关联批次调查 | Related Batches | 其他可能相关的批次 |
| batchRecords | 批记录复核 | Batch Records | 批记录、辅助记录、设备日志 |
| samplesReview | 留样审查 | Samples Review | 产品/物料/留样复核 |
| stabilityStudy | 稳定性考察 | Stability Study | 稳定性考察结果趋势 |
| supplierReview | 供应商核查 | Supplier Review | 物料供应商、设备生产厂家 |

## 调查分析方法

| 方法 | 字段名 | 说明 |
|------|--------|------|
| 事件流程图 | methods.flowchart | 偏差发生阶段分析 |
| 鱼骨图 | methods.fishbone | 人、机、料、法、环、测分析 |
| 头脑风暴 | methods.brainstorm | 所有可能的问题根源 |
| 图片或照片 | methods.photos | 佐证调查过程的图片 |

## 人员差错专项调查（如适用）

| 字段 | 中文 | 英文 | 说明 |
|------|------|------|------|
| machine | Machine（机） | Machine | 设备因素排查 |
| material | Material（料） | Material | 物料因素排查 |
| method | Method（法） | Method | 方法因素排查 |
| environment | Environment（环） | Environment | 环境因素排查 |

## 结论字段

- conclusion: 根本原因调查结论

## 生成提示

基于以下信息生成调查内容：
1. 线索分析结果（analysis）
2. 5M1E 因素（factors）
3. 法规匹配结果（regulations）

从人、机、料、法、环、测六个维度进行全面调查。

## 输出格式

```json
{
  "interviews": "人员面谈记录内容",
  "sopReview": "SOP核查结果",
  "historicalData": "历史数据回顾",
  "relatedBatches": "关联批次调查",
  "batchRecords": "批记录复核",
  "samplesReview": "留样审查",
  "stabilityStudy": "稳定性考察",
  "supplierReview": "供应商核查",
  "methods": {
    "flowchart": true,
    "fishbone": true,
    "brainstorm": false,
    "photos": []
  },
  "humanError": {
    "machine": "设备因素排查结果",
    "material": "物料因素排查结果",
    "method": "方法因素排查结果",
    "environment": "环境因素排查结果"
  },
  "conclusion": "根本原因调查结论"
}
```
