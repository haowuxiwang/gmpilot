# 偏差调查和风险评估报告模板 - 结构化分析

## 1. 模版整体结构（章节层次）

```
偏差调查和风险评估报告
├── 封面区域
│   ├── 标题（中英文）
│   └── 签字表格（起草人、审核人）
├── 目录
└── 正文
    ├── 1. 背景 Background
    ├── 2. 偏差调查 Deviation Investigation
    │   ├── 2.1 根本原因调查 Root Cause Investigation
    │   ├── 2.2 重复偏差调查 Repeat Deviation Investigation
    │   └── 2.3 其他产品或批次调查 Investigation of Other Product or Batch
    ├── 3. 调查结论 Investigation Conclusion
    ├── 4. 风险分析及影响评估 Risks Analysis and Impact Assessment
    ├── 5. 纠正预防措施 CAPA
    ├── 6. 附件清单 Attachment List
    └── 7. 版本修订历史 Version Revision History
```

---

## 2. 所有需要填写的字段

### 2.1 封面签字表格

| 字段 | 中文 | 英文 | 说明 |
|------|------|------|------|
| 部门 | 部门 | Department | 偏差发生部门 |
| 姓名 | 姓名 | Name | 填写人姓名 |
| 签字/日期 | 签字/日期 | Signature/Date | 签字确认 |
| 起草人 | 起草人 | Prepared by | 偏差发生部门主管 |
| 审核人 | 审核人 | Reviewed by | 偏差发生部门负责人 |

### 2.2 章节 1 - 背景 Background

| 字段 | 类型 | 说明 |
|------|------|------|
| 偏差产品 | 文本 | 产品名称 |
| 批次 | 文本 | 批次号 |
| 偏差发生时间 | 日期/时间 | 偏差发生的具体时间 |
| 发生地点 | 文本 | 偏差发生的具体位置 |
| 偏差事件 | 长文本 | 偏差事件的详细描述 |
| 照片/图片 | 附件 | 可选，带有批注的现场照片 |

### 2.3 章节 2.1 - 根本原因调查 Root Cause Investigation

**调查过程记录字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| 人员面谈记录 | 长文本 | 培训、SOP执行、责任心等 |
| SOP核查结果 | 长文本 | 工艺规程、岗位操作法清晰度 |
| 历史数据回顾 | 长文本 | 分析方法、验证报告、年度回顾等 |
| 关联批次调查 | 长文本 | 其他可能相关的批次 |
| 批记录复核 | 长文本 | 批记录、辅助记录、设备日志 |
| 产品/物料/留样复核 | 长文本 | 相关产品、物料、留样检查 |
| 稳定性考察结果 | 长文本 | 稳定性考察结果趋势 |
| 供应商核查 | 长文本 | 物料供应商、设备生产厂家 |

**调查分析方法选择：**

| 方法 | 是否使用 | 结果/说明 |
|------|----------|-----------|
| 事件流程图 | 复选框 | 偏差发生阶段分析 |
| 鱼骨图 | 复选框 | 人、机、料、法、环、测分析 |
| 头脑风暴 | 复选框 | 所有可能的问题根源 |
| 图片或照片 | 附件 | 佐证调查过程的图片 |

**人员差错专项调查（如适用）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| Machine（机） | 长文本 | 设备因素排查 |
| Material（料） | 长文本 | 物料因素排查 |
| Method（法） | 长文本 | 方法因素排查 |
| Environment（环） | 长文本 | 环境因素排查 |

**结论字段：**
- 根本原因调查结论（长文本）

### 2.4 章节 2.2 - 重复偏差调查 Repeat Deviation Investigation

**重复偏差历史表格（24个月内）：**

| 列名 | 英文 | 类型 | 说明 |
|------|------|------|------|
| 序号 | No. | 数字 | 序号 |
| 偏差发生时间 | Time of Deviation | 日期 | 历史偏差发生时间 |
| 偏差编号 | Deviation No. | 文本 | 历史偏差编号 |
| 偏差简要描述 | Brief Deviation Description | 文本 | 历史偏差描述 |
| 根本原因 | Root Cause | 文本 | 历史偏差根本原因 |
| 纠正预防措施内容 | CAPA | 文本 | 历史CAPA措施 |

**分析字段：**
- 重复偏差分析（长文本）
  - 此次偏差的根本原因与原偏差的根本原因是否相同
  - 原制定的CAPA是否有效的完成
  - 原制定的CAPA是否针对根本原因制定
  - 是否需要针对重复偏差输出额外的措施项

**结论字段：**
- 历史回顾结论（长文本）

### 2.5 章节 2.3 - 其他产品或批次调查 Investigation of Other Product or Batch

**其他产品或批次表格：**

| 列名 | 英文 | 类型 | 说明 |
|------|------|------|------|
| 序号 | No. | 数字 | 序号 |
| 产品名称 | Product Name | 文本 | 涉及的其他产品 |
| 批号 | Batch No. | 文本 | 涉及的批次号 |
| 产品的目前状态 | Current Status of Product | 文本 | 与偏差相关情况说明 |

**分析字段：**
- 其他产品或批次分析（长文本）
  - 涉及批次的质量是否受影响
  - 是否需要对涉及批次采取额外措施

**结论字段：**
- 其他产品或批次调查结论（长文本）

### 2.6 章节 3 - 调查结论 Investigation Conclusion

| 字段 | 类型 | 说明 |
|------|------|------|
| 根本原因 | 长文本 | 最终确定的根本原因 |
| 最有可能的原因 | 长文本 | 如无法确定根本原因，列出最有可能的原因 |

### 2.7 章节 4 - 风险分析及影响评估 Risks Analysis and Impact Assessment

| 影响维度 | 类型 | 说明 |
|----------|------|------|
| 质量影响 | 长文本 | 对产品质量的潜在影响 |
| 稳定性影响 | 长文本 | 对产品稳定性的潜在影响 |
| 上市许可文件/注册文件影响 | 长文本 | 对注册文件的影响 |
| 客户影响 | 长文本 | 对客户的影响 |
| 验证有效性影响 | 长文本 | 对验证有效性的影响 |

### 2.8 章节 5 - 纠正预防措施 CAPA

**CAPA 表格：**

| 列名 | 类型 | 说明 |
|------|------|------|
| CAPA编号 | 文本 | CAPA系统编号 |
| 纠正内容/纠正预防措施内容 | 长文本 | 具体的纠正或预防措施 |
| 执行人 | 文本 | 负责执行的人员 |
| 预期完成日期 | 日期 | 计划完成日期 |
| 执行人签字/日期 | 签字+日期 | 执行确认 |

**注意：** 模板中包含两个表格：
1. 纠正措施表格（CAPA编号、纠正内容、执行人、预期完成日期、执行人签字/日期）
2. 预防措施表格（CAPA编号、纠正预防措施内容、执行人、预期完成日期、执行人签字/日期）

### 2.9 章节 6 - 附件清单 Attachment List

| 列名 | 类型 | 说明 |
|------|------|------|
| 附件编号 | 文本 | 如"调查报告-附件X" |
| 附件名称 | 文本 | 附件的具体名称 |
| 总页数 | 数字 | 附件的页数 |

### 2.10 章节 7 - 版本修订历史 Version Revision History

| 列名 | 类型 | 说明 |
|------|------|------|
| 版本号 | 文本 | 文档版本号 |
| 执行日期 | 日期 | 该版本的执行日期 |
| 修订原因 | 文本 | 修订的原因 |
| 主要修订内容 | 长文本 | 修订的具体内容 |

---

## 3. 固定内容和可变内容的区分

### 3.1 固定内容（模板指导文本，不可修改）

**章节标题（中英文双语）：**
- 所有章节标题
- 所有子章节标题

**调查指导说明：**
- "结合H0-SOP-71002-R01《偏差处理表》中偏差内容进行简要的偏差描述..."
- "调查相关人员应从人、机、料、法、环、测等方面进行全面调查..."
- "调查可利用各种调查工具（如事件流程图，鱼骨图，头脑风暴，5个为什么等）..."
- 8项调查过程指导（人员面谈、SOP核查、历史数据回顾等）
- 4项调查分析方法说明（事件流程图、鱼骨图、头脑风暴、图片或照片）
- 人员差错专项调查指导（Machine、Material、Method、Environment）

**分析提示文本：**
- "此处需对导致偏差重复发生的原因进行简要分析..."
- "此处需对偏差涉及的其他产品或批次进行简要的分析..."
- 各种"结论：XXX？"的提示文本

**表格表头：**
- 所有表格的列标题（中英文）

### 3.2 可变内容（需要填写的字段）

**封面信息：**
- 部门、姓名、签字/日期
- 起草人、审核人信息

**偏差基本信息：**
- 偏差产品、批次、发生时间、发生地点、偏差事件描述

**调查结果：**
- 根本原因调查各维度的结果
- 调查分析方法的使用情况和结果
- 各项结论文本

**历史数据：**
- 重复偏差历史记录（表格数据）
- 其他产品或批次调查数据（表格数据）

**风险评估：**
- 各影响维度的评估结果

**CAPA措施：**
- CAPA编号、措施内容、执行人、日期等

**附件和版本：**
- 附件清单信息
- 版本修订记录

---

## 4. 格式要求

### 4.1 文档整体格式

| 属性 | 要求 |
|------|------|
| 语言 | 中英文双语 |
| 标题格式 | 章节标题使用 Heading 1 样式 |
| 正文字体 | 宋体（中文）/ Times New Roman（英文） |
| 正文字号 | 小四（12pt）或五号（10.5pt） |
| 行距 | 1.5倍行距 |
| 页边距 | 上下2.54cm，左右3.17cm（标准A4） |

### 4.2 封面签字表格格式

```html
<table>
  <tr>
    <td></td>
    <td colspan="2">部门：Department</td>
    <td>姓名：Name</td>
    <td colspan="2">签字/日期：Signature/Date</td>
  </tr>
  <tr>
    <td>起草人：Prepared by</td>
    <td>偏差发生部门主管</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td>审核人：Reviewed by</td>
    <td>偏差发生部门负责人</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>
```

**特点：**
- 使用合并单元格（colspan）
- 6列布局
- 中英文上下排列

### 4.3 数据表格格式

**重复偏差调查表格（6列）：**
```html
<table>
  <thead>
    <tr>
      <th>序号 No.</th>
      <th>偏差发生时间 Time of Deviation</th>
      <th>偏差编号 Deviation No.</th>
      <th>偏差简要描述 Brief Deviation Description</th>
      <th>根本原因 Root Cause</th>
      <th>纠正预防措施内容 CAPA</th>
    </tr>
  </thead>
  <tbody>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
```

**其他产品或批次调查表格（4列）：**
```html
<table>
  <thead>
    <tr>
      <th>序号 No.</th>
      <th>产品名称 Product Name</th>
      <th>批号 Batch No.</th>
      <th>产品的目前状态 Current Status of Product</th>
    </tr>
  </thead>
  <tbody>
    <tr><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
```

**CAPA表格（5列，有两个表格）：**
```html
<table>
  <thead>
    <tr>
      <th>CAPA编号</th>
      <th>纠正内容</th>
      <th>执行人</th>
      <th>预期完成日期</th>
      <th>执行人签字/日期</th>
    </tr>
  </thead>
  <tbody>
    <tr><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
```

**附件清单表格（3列）：**
```html
<table>
  <thead>
    <tr>
      <th>附件编号</th>
      <th>附件名称</th>
      <th>总页数</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>调查报告-附件X</td><td></td><td></td></tr>
  </tbody>
</table>
```

**版本修订历史表格（4列）：**
```html
<table>
  <tr>
    <td>版本号</td>
    <td>执行日期</td>
    <td>修订原因</td>
    <td>主要修订内容</td>
  </tr>
  <tr>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>
```

### 4.4 文本格式

| 元素 | 格式要求 |
|------|----------|
| 章节标题 | Heading 1，加粗，中英文 |
| 子章节标题 | Heading 2 或加粗，中英文 |
| 表格表头 | 加粗，中英文上下排列 |
| 正文 | 宋体/Times New Roman，小四或五号 |
| 提示文本 | 可能使用不同颜色或斜体（需原文件确认） |

### 4.5 特殊格式要求

1. **中英文双语：** 所有标题和表头都使用中英文上下排列
2. **表格边框：** 标准表格边框，表头可能有底色
3. **签字区域：** 预留足够的签字空间
4. **附件引用：** 使用"调查报告-附件X"格式
5. **列表格式：** 使用圆点或数字列表

---

## 5. 数据模型建议

基于以上分析，建议的数据模型结构：

```typescript
interface DeviationReport {
  // 封面信息
  cover: {
    department: string;
    name: string;
    signatureDate: string;
    preparedBy: string;
    reviewedBy: string;
  };

  // 章节1：背景
  background: {
    product: string;
    batch: string;
    occurrenceTime: string;
    location: string;
    description: string;
    photos?: string[]; // 附件路径
  };

  // 章节2：偏差调查
  investigation: {
    // 2.1 根本原因调查
    rootCause: {
      interviews: string;
      sopReview: string;
      historicalData: string;
      relatedBatches: string;
      batchRecords: string;
      samplesReview: string;
      stabilityStudy: string;
      supplierReview: string;
      methods: {
        flowchart: boolean;
        fishbone: boolean;
        brainstorm: boolean;
        photos: string[];
      };
      humanError?: {
        machine: string;
        material: string;
        method: string;
        environment: string;
      };
      conclusion: string;
    };

    // 2.2 重复偏差调查
    repeatDeviations: {
      records: Array<{
        time: string;
        deviationNo: string;
        description: string;
        rootCause: string;
        capa: string;
      }>;
      analysis: string;
      conclusion: string;
    };

    // 2.3 其他产品或批次调查
    otherProducts: {
      records: Array<{
        productName: string;
        batchNo: string;
        currentStatus: string;
      }>;
      analysis: string;
      conclusion: string;
    };
  };

  // 章节3：调查结论
  conclusion: {
    rootCause: string;
    mostLikelyCause?: string;
  };

  // 章节4：风险分析
  riskAssessment: {
    qualityImpact: string;
    stabilityImpact: string;
    registrationImpact: string;
    customerImpact: string;
    validationImpact: string;
  };

  // 章节5：CAPA
  capa: {
    corrections: Array<{
      capaNo: string;
      content: string;
      executor: string;
      expectedDate: string;
      signatureDate: string;
    }>;
    preventions: Array<{
      capaNo: string;
      content: string;
      executor: string;
      expectedDate: string;
      signatureDate: string;
    }>;
  };

  // 章节6：附件清单
  attachments: Array<{
    no: string;
    name: string;
    pages: number;
  }>;

  // 章节7：版本历史
  versionHistory: Array<{
    version: string;
    executionDate: string;
    revisionReason: string;
    mainChanges: string;
  }>;
}
```

---

## 6. 转换消息说明

mammoth 转换时产生的消息：
1. `Unrecognised paragraph style: 'toc 1' (Style ID: TOC1)` - 目录样式未识别
2. `Unrecognised paragraph style: 'Body Text' (Style ID: a0)` - 正文文本样式未识别

这些消息说明文档使用了自定义样式，但不影响内容提取。

---

## 7. 关键发现

### 7.1 文档特点
- **GMP合规性：** 符合制药行业GMP偏差处理规范
- **中英文双语：** 所有标题和表头都提供中英文版本
- **结构化调查：** 从人、机、料、法、环、测六个维度进行根本原因调查
- **历史追溯：** 要求回顾24个月内的重复偏差
- **全面评估：** 从质量、稳定性、注册、客户、验证五个维度进行风险评估

### 7.2 表格数量统计
- 封面签字表格：1个（6列 x 3行）
- 重复偏差调查表格：1个（6列，动态行数）
- 其他产品或批次调查表格：1个（4列，动态行数）
- CAPA表格：2个（5列，动态行数）
- 附件清单表格：1个（3列，动态行数）
- 版本修订历史表格：1个（4列，动态行数）

**总计：7个表格**

### 7.3 字段数量统计
- 封面字段：5个
- 背景字段：6个
- 根本原因调查字段：12+个（含子字段）
- 重复偏差调查字段：6列 x N行 + 2个分析/结论字段
- 其他产品或批次字段：4列 x N行 + 2个分析/结论字段
- 调查结论字段：2个
- 风险评估字段：5个
- CAPA字段：5列 x N行 x 2表格
- 附件清单字段：3列 x N行
- 版本历史字段：4列 x N行

**总计：约50+个独立字段**
