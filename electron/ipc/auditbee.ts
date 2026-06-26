/**
 * AuditBee integration IPC handlers for Electron main process.
 * Provides health check, report audit, findings retrieval, and audit history.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { AuditBeeClient } from '../../core/integration/auditbee-client';
import { getDatabase, initSchema } from '../../core/db/connection';
import { createAuditTask, getAuditTasksByReport } from '../../core/db/schema';
import { createLogger } from '../../core/utils/logger';
import type { DeviationReport } from '../../core/workflow/types';

const log = createLogger('AuditBee');

let client: AuditBeeClient | null = null;

// C-3 fix: baseUrl no longer accepted from renderer — SSRF prevention.
// Client is created once from env/DB settings, not from renderer input.
function getClient(): AuditBeeClient {
  if (!client) {
    client = new AuditBeeClient();
  }
  return client;
}

export function registerAuditBeeIPC(): void {
  // Health check (no baseUrl param — SSRF fix)
  ipcMain.handle('auditbee:checkHealth', async () => {
    try {
      const c = getClient();
      const available = await c.isAvailable();
      return { available };
    } catch (error) {
      log.error('AuditBee health check failed', { error: String(error) });
      return { available: false, error: 'AuditBee 连接失败' };
    }
  });

  // Audit a deviation report (no baseUrl param — SSRF fix)
  ipcMain.handle('auditbee:auditReport', async (event, params: {
    report: DeviationReport;
    reportId?: number;
  }) => {
    if (!params?.report || typeof params.report !== 'object') {
      return { success: false, error: '无效的报告数据' };
    }
    const window = BrowserWindow.fromWebContents(event.sender);

    try {
      const c = getClient();

      // Convert report to markdown for upload
      const markdown = reportToMarkdown(params.report);
      const filename = `${params.report.deviationId || 'deviation'}-report.md`;

      // Run full audit workflow with progress callbacks
      const result = await c.auditReport({
        reportContent: markdown,
        reportTitle: filename,
        onProgress: (stage, task) => {
          // Send progress to renderer
          if (window && !window.isDestroyed()) {
            window.webContents.send('auditbee:progress', { stage, task });
          }
        },
      });

      // Persist audit result to database if reportId provided
      if (params.reportId) {
        try {
          const db = getDatabase();
          await initSchema(db);
          createAuditTask(db, {
            report_id: params.reportId,
            auditbee_task_id: result.task.id,
            status: 'completed',
            findings_json: JSON.stringify(result.findings),
          });
          log.info('Audit result saved to DB', { reportId: params.reportId, taskId: result.task.id });
        } catch (dbError) {
          log.error('Failed to save audit result to DB', { error: String(dbError) });
          // Non-fatal: audit succeeded, just failed to persist
        }
      }

      return { success: true, findings: result.findings, taskId: result.task.id };
    } catch (error) {
      log.error('AuditBee auditReport failed', { error: String(error) });

      // Send failure progress to renderer
      if (window && !window.isDestroyed()) {
        window.webContents.send('auditbee:progress', { stage: 'failed', error: String(error) });
      }

      return { success: false, error: '审计任务执行失败' };
    }
  });

  // Get findings for a task (no baseUrl param — SSRF fix)
  ipcMain.handle('auditbee:getFindings', async (_event, params: {
    taskId: number;
  }) => {
    if (!params?.taskId || !Number.isInteger(params.taskId) || params.taskId <= 0) {
      return { success: false, error: '无效的任务 ID' };
    }
    try {
      const c = getClient();
      const findings = await c.getFindings(params.taskId);
      return { success: true, findings };
    } catch (error) {
      log.error('AuditBee getFindings failed', { taskId: params.taskId, error: String(error) });
      return { success: false, error: '获取审计结果失败' };
    }
  });

  // Get task status (no baseUrl param — SSRF fix)
  ipcMain.handle('auditbee:getTaskStatus', async (_event, params: {
    taskId: number;
  }) => {
    if (!params?.taskId || !Number.isInteger(params.taskId) || params.taskId <= 0) {
      return { success: false, error: '无效的任务 ID' };
    }
    try {
      const c = getClient();
      const task = await c.getTask(params.taskId);
      return { success: true, task };
    } catch (error) {
      log.error('AuditBee getTaskStatus failed', { taskId: params.taskId, error: String(error) });
      return { success: false, error: '获取任务状态失败' };
    }
  });

  // Get audit history for a report
  ipcMain.handle('auditbee:getAuditHistory', async (_event, reportId: number) => {
    try {
      const db = getDatabase();
      await initSchema(db);
      return getAuditTasksByReport(db, reportId);
    } catch (error) {
      log.error('AuditBee getAuditHistory failed', { reportId, error: String(error) });
      return [];
    }
  });
}

/**
 * Convert DeviationReport to Markdown for AuditBee upload.
 */
function reportToMarkdown(report: DeviationReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.cover.title}`);
  lines.push(`**${report.cover.titleEn}**`);
  lines.push('');
  lines.push(`- **偏差编号**: ${report.deviationId}`);
  lines.push(`- **部门**: ${report.cover.department}`);
  lines.push(`- **风险评分**: ${report.riskScore}/100 (${report.riskLevel})`);
  lines.push('');

  // Background
  lines.push('## 1. 背景');
  lines.push(`- **产品**: ${report.background.product}`);
  lines.push(`- **批次**: ${report.background.batch}`);
  lines.push(`- **发生时间**: ${report.background.occurrenceTime}`);
  lines.push(`- **发生地点**: ${report.background.location}`);
  lines.push(`- **描述**: ${report.background.description}`);
  lines.push('');

  // Investigation
  lines.push('## 2. 偏差调查');
  lines.push('### 2.1 根本原因调查');
  const rc = report.investigation.rootCause;
  lines.push(`- **人员面谈**: ${rc.interviews}`);
  lines.push(`- **SOP核查**: ${rc.sopReview}`);
  lines.push(`- **历史数据**: ${rc.historicalData}`);
  lines.push(`- **调查结论**: ${rc.conclusion}`);
  lines.push('');

  // Conclusion
  lines.push('## 3. 调查结论');
  lines.push(`- **根本原因**: ${report.conclusion.rootCause}`);
  if (report.conclusion.mostLikelyCause) {
    lines.push(`- **最有可能原因**: ${report.conclusion.mostLikelyCause}`);
  }
  lines.push('');

  // Risk Assessment
  lines.push('## 4. 风险分析');
  lines.push(`- **产品质量**: ${report.riskAssessment.qualityImpact}`);
  lines.push(`- **稳定性**: ${report.riskAssessment.stabilityImpact}`);
  lines.push(`- **注册**: ${report.riskAssessment.registrationImpact}`);
  lines.push(`- **客户**: ${report.riskAssessment.customerImpact}`);
  lines.push(`- **验证**: ${report.riskAssessment.validationImpact}`);
  lines.push('');

  // CAPA
  lines.push('## 5. CAPA');
  if (report.capa.corrections.length > 0) {
    lines.push('### 纠正措施');
    for (const c of report.capa.corrections) {
      lines.push(`- ${c.capaNo}: ${c.content} (执行人: ${c.executor}, 预期: ${c.expectedDate})`);
    }
  }
  if (report.capa.preventions.length > 0) {
    lines.push('### 预防措施');
    for (const p of report.capa.preventions) {
      lines.push(`- ${p.capaNo}: ${p.content} (执行人: ${p.executor}, 预期: ${p.expectedDate})`);
    }
  }

  return lines.join('\n');
}
