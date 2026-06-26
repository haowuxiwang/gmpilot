# 封面 Cover

## 固定内容

- 报告标题（中文）：偏差调查和风险评估报告
- 报告标题（英文）：Deviation Investigation and Risk Assessment Report

## 可变字段

| 字段 | 中文 | 英文 | 说明 |
|------|------|------|------|
| department | 部门 | Department | 偏差发生部门 |
| preparedBy.name | 起草人姓名 | Prepared by Name | 偏差发生部门主管 |
| preparedBy.signatureDate | 起草人签字日期 | Prepared by Date | 签字确认 |
| reviewedBy.name | 审核人姓名 | Reviewed by Name | 偏差发生部门负责人 |
| reviewedBy.signatureDate | 审核人签字日期 | Reviewed by Date | 签字确认 |

## 模版结构

```
<table>
  <tr>
    <td></td>
    <td colspan="2">部门：{{department}}</td>
    <td>姓名：{{preparedBy.name}}</td>
    <td colspan="2">签字/日期：{{preparedBy.signatureDate}}</td>
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
