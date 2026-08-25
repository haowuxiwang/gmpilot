/**
 * Convert DeviationReport to Markdown format.
 * Shared utility used by Audit Agent and PDF export.
 */

import type { DeviationReport } from './types';

/** Safe property access with fallback */
function safe(value: unknown, fallback = 'N/A'): string {
  return value != null ? String(value) : fallback;
}

export function reportToMarkdown(report: DeviationReport): string {
  const lines: string[] = [];

  // Cover section with null safety
  const cover = report.cover ?? {} as DeviationReport['cover'];
  lines.push(`# ${safe(cover.title, '偏差调查报告')}`);
  lines.push(`**${safe(cover.titleEn, 'Deviation Investigation Report')}**`);
  lines.push('');
  lines.push(`- **偏差编号**: ${safe(report.deviationId)}`);
  lines.push(`- **部门**: ${safe(cover.department)}`);
  lines.push(`- **风险评分**: ${safe(report.riskScore, '0')}/100 (${safe(report.riskLevel, '未评估')})`);
  lines.push('');

  // Background
  const bg = report.background ?? {} as DeviationReport['background'];
  lines.push('## 1. 背景 Background');
  lines.push(`- **产品 Product**: ${safe(bg.product)}`);
  lines.push(`- **批次 Batch**: ${safe(bg.batch)}`);
  lines.push(`- **发生时间 Occurrence Time**: ${safe(bg.occurrenceTime)}`);
  lines.push(`- **发生地点 Location**: ${safe(bg.location)}`);
  lines.push(`- **描述 Description**: ${safe(bg.description)}`);
  lines.push('');

  // Investigation
  const inv = report.investigation ?? {} as DeviationReport['investigation'];
  const rc = inv.rootCause ?? {} as NonNullable<DeviationReport['investigation']>['rootCause'];
  lines.push('## 2. 偏差调查 Deviation Investigation');
  lines.push('### 2.1 根本原因调查 Root Cause Investigation');

  // Preliminary analysis (optional)
  if (rc.preliminaryAnalysis) {
    lines.push(`**初步分析 Preliminary Analysis**: ${rc.preliminaryAnalysis}`);
    lines.push('');
  }

  // Investigation scope table (optional)
  if (rc.investigationScope && rc.investigationScope.length > 0) {
    lines.push('**调查范围 Investigation Scope**:');
    lines.push('| 调查范围 | 调查内容 | 识别的风险点 |');
    lines.push('|----------|----------|--------------|');
    for (const s of rc.investigationScope) {
      lines.push(`| ${safe(s.category)} | ${safe(s.details)} | ${safe(s.ruledInOut)} |`);
    }
    lines.push('');
  }

  // 5M1E+测量 factors
  const factors = rc.factors ?? {} as NonNullable<DeviationReport['investigation']>['rootCause']['factors'];
  lines.push('**人、机、料、法、环、测全面调查**:');
  lines.push(`- **人员 Man**: ${safe(factors.man)}`);
  lines.push(`- **设备 Machine**: ${safe(factors.machine)}`);
  lines.push(`- **物料 Material**: ${safe(factors.material)}`);
  lines.push(`- **方法 Method**: ${safe(factors.method)}`);
  lines.push(`- **环境 Environment**: ${safe(factors.environment)}`);
  lines.push(`- **测量 Measurement**: ${safe(factors.measurement)}`);
  lines.push('');

  // Investigation methods
  if (rc.methods) {
    const m = rc.methods;
    lines.push('**调查分析方法 Methods**:');
    lines.push(`- 事件流程图 Flowchart: ${m.flowchart ? '☑' : '☐'}`);
    lines.push(`- 鱼骨图 Fishbone: ${m.fishbone ? '☑' : '☐'}`);
    lines.push(`- 头脑风暴 Brainstorm: ${m.brainstorm ? '☑' : '☐'}`);
    lines.push('');
  }

  lines.push(`- **调查结论 Conclusion**: ${safe(rc.conclusion)}`);
  lines.push('');

  // 2.2 Repeat deviations
  const rd = inv.repeatDeviations ?? {} as NonNullable<DeviationReport['investigation']>['repeatDeviations'];
  lines.push('### 2.2 重复偏差调查 Repeat Deviation Investigation');
  if (rd.records && rd.records.length > 0) {
    lines.push('| 序号 | 时间 | 偏差编号 | 描述 | 根本原因 | CAPA |');
    lines.push('|------|------|----------|------|----------|------|');
    for (const r of rd.records) {
      lines.push(`| ${safe(r.no)} | ${safe(r.time)} | ${safe(r.deviationNo)} | ${safe(r.description)} | ${safe(r.rootCause)} | ${safe(r.capa)} |`);
    }
  } else {
    lines.push('无历史重复偏差记录。');
  }
  lines.push(`- **分析 Analysis**: ${safe(rd.analysis)}`);
  lines.push(`- **结论 Conclusion**: ${safe(rd.conclusion)}`);
  lines.push('');

  // 2.3 Other products
  const op = inv.otherProducts ?? {} as NonNullable<DeviationReport['investigation']>['otherProducts'];
  lines.push('### 2.3 其他产品或批次调查 Investigation of Other Product or Batch');
  if (op.records && op.records.length > 0) {
    lines.push('| 序号 | 产品名称 | 批次号 | 当前状态 |');
    lines.push('|------|----------|--------|----------|');
    for (const r of op.records) {
      lines.push(`| ${safe(r.no)} | ${safe(r.productName)} | ${safe(r.batchNo)} | ${safe(r.currentStatus)} |`);
    }
  } else {
    lines.push('无其他受影响产品/批次。');
  }
  lines.push(`- **影响分析 Analysis**: ${safe(op.analysis)}`);
  lines.push(`- **影响结论 Conclusion**: ${safe(op.conclusion)}`);
  lines.push('');

  // Conclusion
  const conc = report.conclusion ?? {} as DeviationReport['conclusion'];
  lines.push('## 3. 调查结论 Investigation Conclusion');
  lines.push(`- **根本原因 Root Cause**: ${safe(conc.rootCause)}`);
  if (conc.mostLikelyCause) {
    lines.push(`- **最有可能原因 Most Likely Cause**: ${conc.mostLikelyCause}`);
  }
  lines.push('');

  // Risk Assessment
  const risk = report.riskAssessment ?? {} as DeviationReport['riskAssessment'];
  lines.push('## 4. 风险分析及影响评估 Risks Analysis and Impact Assessment');
  for (const paragraph of (risk.description || '').split('\n').filter(Boolean)) {
    lines.push(`- ${safe(paragraph)}`);
  }
  if (risk.summary) {
    lines.push(`- **小结 Summary**: ${safe(risk.summary)}`);
  }
  lines.push('');

  // CAPA
  const capa = report.capa ?? { corrections: [], preventions: [] } as DeviationReport['capa'];
  lines.push('## 5. 纠正预防措施 CAPA');
  if (capa.corrections && capa.corrections.length > 0) {
    lines.push('### 5.1 纠正措施 Corrective Actions');
    lines.push('| 编号 | 内容 | 执行人 | 预期完成日期 |');
    lines.push('|------|------|--------|--------------|');
    for (const c of capa.corrections) {
      lines.push(`| ${safe(c.capaNo)} | ${safe(c.content)} | ${safe(c.executor)} | ${safe(c.expectedDate)} |`);
    }
  }
  if (capa.preventions && capa.preventions.length > 0) {
    lines.push('### 5.2 预防措施 Preventive Actions');
    lines.push('| 编号 | 内容 | 执行人 | 预期完成日期 |');
    lines.push('|------|------|--------|--------------|');
    for (const p of capa.preventions) {
      lines.push(`| ${safe(p.capaNo)} | ${safe(p.content)} | ${safe(p.executor)} | ${safe(p.expectedDate)} |`);
    }
  }
  lines.push('');

  // Attachments
  const attachments = report.attachments ?? [];
  lines.push('## 6. 附件清单 Attachment List');
  if (attachments.length > 0) {
    lines.push('| 编号 | 附件名称 | 页数 |');
    lines.push('|------|----------|------|');
    for (const a of attachments) {
      lines.push(`| ${safe(a.no)} | ${safe(a.name)} | ${safe(String(a.pages))} |`);
    }
  } else {
    lines.push('无附件。');
  }
  lines.push('');

  // Version History
  const versionHistory = report.versionHistory ?? [];
  lines.push('## 7. 版本修订历史 Version Revision History');
  if (versionHistory.length > 0) {
    lines.push('| 版本号 | 执行日期 | 修订原因 | 主要变更 |');
    lines.push('|--------|----------|----------|----------|');
    for (const v of versionHistory) {
      lines.push(`| ${safe(v.version)} | ${safe(v.executionDate)} | ${safe(v.revisionReason)} | ${safe(v.mainChanges)} |`);
    }
  } else {
    lines.push('无版本历史。');
  }

  return lines.join('\n');
}
