# GMPilot × AuditBee 集成方案

> 版本：v1.0 | 更新日期：2026-06-03

## 概述

GMPilot（偏差报告生成）和 AuditBee（合规性审计）是制药合规流程的两个阶段。本文档定义它们之间的数据流和 API 对接方式。

## 业务流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     制药合规工作流                                │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   GMPilot    │ ───▶ │   AuditBee   │ ───▶ │   修订反馈   │  │
│  │  偏差报告生成  │      │  合规性审计   │      │  GMPilot 修订 │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                 │
│  输入: 线索 + 文件        输入: GMPilot 报告       输出: 最终报告  │
│  输出: 偏差报告(Markdown)  输出: 审计发现 + 建议                  │
└─────────────────────────────────────────────────────────────────┘
```

## 对接方式

### 方式一：文件导入（MVP 阶段）

GMPilot 导出偏差报告文件，用户手动导入 AuditBee。

```
GMPilot → 导出 .md/.pdf 文件 → 用户上传到 AuditBee → 审计
```

**优点：** 零耦合，两个应用完全独立
**缺点：** 需要手动操作

### 方式二：本地 API 调用（推荐）

GMPilot 通过 HTTP 直接调用 AuditBee 的 FastAPI 接口。

```
GMPilot (Electron)
    │
    │  HTTP localhost:8000
    ▼
AuditBee (FastAPI)
    ├── POST /documents/upload
    ├── POST /audit/tasks
    ├── POST /audit/tasks/{id}/run
    ├── GET  /audit/tasks/{id}/findings
    └── GET  /reports/{id}/content
```

**前提：** AuditBee 正在运行（`localhost:8000`）

### 方式三：MCP 协议（未来）

两个项目都暴露 MCP Server，被 Claude Code 等外部 Agent 调度。

## API 对接详细流程

### Step 1: 上传偏差报告到 AuditBee

```typescript
// GMPilot 调用 AuditBee API
const formData = new FormData();
formData.append('file', reportFile);  // GMPilot 导出的 .md 文件

const response = await fetch('http://localhost:8000/api/documents/upload', {
  method: 'POST',
  body: formData,
});

const document = await response.json();
// { id: 42, filename: "偏差报告_20260603.md", ... }
```

### Step 2: 创建审计任务

```typescript
const response = await fetch('http://localhost:8000/api/audit/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task_name: `偏差报告审计 - ${report.title}`,
    task_type: 'deviation_analysis',
    document_ids: [document.id],
  }),
});

const task = await response.json();
// { id: 15, status: "pending", ... }
```

### Step 3: 执行审计

```typescript
await fetch(`http://localhost:8000/api/audit/tasks/${task.id}/run`, {
  method: 'POST',
});
```

### Step 4: 轮询状态 + 获取结果

```typescript
// 轮询直到完成
let taskStatus;
do {
  await sleep(2000);
  const res = await fetch(`http://localhost:8000/api/audit/tasks/${task.id}`);
  taskStatus = await res.json();
} while (taskStatus.status === 'running');

// 获取审计发现
const findings = await fetch(
  `http://localhost:8000/api/audit/tasks/${task.id}/findings`
).then(r => r.json());

// findings 结构:
// [{
//   finding_type: "compliance_risk",
//   severity: "high",
//   title: "偏差编号未按SOP规定格式填写",
//   description: "...",
//   evidence: "...",
//   suggestion: "...",
//   regulation_ref: "中国GMP 第二章 第十条"
// }]
```

### Step 5: 反馈给 GMPilot 用户

GMPilot 接收 AuditBee 的 findings，在 UI 中展示：
- 高风险问题标红
- 每个问题显示法规引用和改进建议
- 用户点击「修订」→ 工作流回到 generating 步点，将 findings 注入 prompt

## 数据格式映射

### GMPilot Finding → AuditBee Finding

```typescript
// GMPilot 输出的 Finding 直接兼容 AuditBee 的 Finding 表
const gmpilotFinding: Finding = {
  finding_type: 'compliance_risk',   // 对齐 AuditBee FindingType
  severity: 'high',                   // 对齐 AuditBee SeverityLevel
  title: '偏差描述不完整',
  description: '偏差报告中缺少对偏差范围的描述',
  evidence: '报告第三段仅描述了偏差现象，未说明影响范围',
  suggestion: '补充偏差影响范围评估',
  regulation_ref: '中国GMP 第二章 第十条 偏差处理',
};
// 这个对象可以直接 POST 到 AuditBee 的 Finding API
```

### GMPilot Report → AuditBee Report

```typescript
// GMPilot 的 DeviationReport 可转换为 AuditBee 的 Report 格式
const auditBeeReport = {
  task_id: auditTaskId,
  report_type: 'full_report',
  title: gmpilotReport.title,
  content: gmpilotReport.content,  // Markdown 格式
  report_metadata: {
    findings_count: gmpilotReport.findings.length,
    task_type: 'deviation_analysis',
    report_source: 'gmpilot_generate',
    deviation_id: gmpilotReport.deviationId,
    risk_score: gmpilotReport.riskScore,
    risk_level: gmpilotReport.riskLevel,
  },
};
```

## 共享配置

### LLM Provider 环境变量

GMPilot 和 AuditBee 使用相同的环境变量命名：

```bash
# 两个项目共享同一套 API Key
DEEPSEEK_API_KEY=xxx
OPENAI_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
MIMO_API_KEY=xxx
# ... 其他 provider

# 两个项目共享同一套 provider 选择
AGENT_LLM_PROVIDER=mimo
```

### 法规知识库

两个项目共享相同格式的法规文档：

```
命名规范: {standard}_{region}_{chapter}_{topic}.txt
示例:     gmp_china_ch02_quality.txt
          ich_q9_risk_management.txt
```

GMPilot 的 `knowledge/builtin/` 可以直接复制 AuditBee 的 `graphrag_index/input/` 文件。

## GMPilot 需要实现的集成模块

```
core/
├── integration/
│   ├── auditbee-client.ts    # AuditBee API 客户端
│   ├── types.ts              # AuditBee API 请求/响应类型
│   └── workflow.ts           # 集成工作流（生成 → 审计 → 修订）
```

## 启动条件检测

GMPilot 启动时检测 AuditBee 是否运行：

```typescript
async function checkAuditBeeStatus(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8000/api/health');
    return res.ok;
  } catch {
    return false;
  }
}
```

- AuditBee 运行中 → 显示「发送到 AuditBee 审计」按钮
- AuditBee 未运行 → 显示「启动 AuditBee 以启用审计功能」提示
