# 背景 Background

## 章节说明

本章节描述偏差的基本信息，包括涉及产品、批次、发生时间、地点和详细描述。

## 可变字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| product | 涉及产品 | Product | 文本 | 产品名称 |
| batch | 批次号 | Batch No. | 文本 | 批次号 |
| occurrenceTime | 发生时间 | Occurrence Time | 日期/时间 | 偏差发生的具体时间 |
| location | 发生地点 | Location | 文本 | 偏差发生的具体位置 |
| description | 偏差描述 | Description | 长文本 | 偏差事件的详细描述 |
| photos | 照片 | Photos | 附件数组 | 可选，带有批注的现场照片 |

## 生成提示

从用户输入的线索中提取以下信息：
1. 涉及的产品名称
2. 批次号
3. 偏差发生的时间
4. 偏差发生的地点
5. 偏差事件的详细描述

如果线索中缺少某些信息，使用合理的默认值或标记为"待补充"。

## 输出格式

```json
{
  "product": "产品名称",
  "batch": "批次号",
  "occurrenceTime": "YYYY-MM-DD HH:mm",
  "location": "发生地点",
  "description": "详细描述偏差现象、涉及的产品/批次/设备",
  "photos": []
}
```
