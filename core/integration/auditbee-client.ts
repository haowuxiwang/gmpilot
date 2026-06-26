/**
 * AuditBee API client for GMPilot integration.
 * Calls AuditBee's FastAPI endpoints on localhost.
 */

import type { AuditBeeTask, AuditBeeFinding, AuditBeeReport } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('AuditBee');

// ============================================================================
// Client
// ============================================================================

export class AuditBeeClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.AUDITBEE_BASE_URL || 'http://localhost:8000';
  }

  /**
   * Fetch with retry for transient failures.
   * Exponential backoff: 1s, 2s, 4s.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 2,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok || attempt === maxRetries) return res;
        // Retry on 5xx
        if (res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        return res; // 4xx — don't retry
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    throw lastError;
  }

  /**
   * Check if AuditBee is running.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Upload a document to AuditBee.
   */
  async uploadDocument(file: File | Blob, filename: string): Promise<{ id: number }> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const res = await this.fetchWithRetry(`${this.baseUrl}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Create an audit task.
   */
  async createTask(params: {
    taskName: string;
    taskType: string;
    documentIds: number[];
  }): Promise<AuditBeeTask> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/audit/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_name: params.taskName,
        task_type: params.taskType,
        document_ids: params.documentIds,
      }),
    });

    if (!res.ok) {
      throw new Error(`Create task failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Run an audit task.
   */
  async runTask(taskId: number): Promise<void> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/audit/tasks/${taskId}/run`, {
      method: 'POST',
    });

    if (!res.ok) {
      throw new Error(`Run task failed: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * Get task status.
   */
  async getTask(taskId: number): Promise<AuditBeeTask> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/audit/tasks/${taskId}`, {});
    if (!res.ok) throw new Error(`Get task failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Wait for task to complete (polling).
   * Includes circuit-breaker: stops after 3 consecutive failures.
   */
  async waitForCompletion(
    taskId: number,
    options: { interval?: number; timeout?: number; onProgress?: (task: AuditBeeTask) => void } = {},
  ): Promise<AuditBeeTask> {
    const { interval = 2000, timeout = 300000, onProgress } = options;
    const start = Date.now();
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    while (Date.now() - start < timeout) {
      try {
        const task = await this.getTask(taskId);
        consecutiveFailures = 0;  // Reset on success
        onProgress?.(task);

        if (task.status === 'completed' || task.status === 'failed' || task.status === 'awaiting_review') {
          return task;
        }

        await new Promise((r) => setTimeout(r, interval));
      } catch (error) {
        consecutiveFailures++;
        log.warn('Polling failure', { taskId, consecutiveFailures, error: String(error) });

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error(`AuditBee 服务不可用（连续 ${MAX_CONSECUTIVE_FAILURES} 次失败），请稍后重试`);
        }

        // Wait before retrying
        await new Promise((r) => setTimeout(r, interval));
      }
    }

    throw new Error('Task timed out');
  }

  /**
   * Get findings for a task.
   */
  async getFindings(taskId: number): Promise<AuditBeeFinding[]> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/audit/tasks/${taskId}/findings`, {});
    if (!res.ok) throw new Error(`Get findings failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Get report for a task.
   */
  async getReport(taskId: number): Promise<AuditBeeReport | null> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/reports/?task_id=${taskId}`, {});
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] || null;
  }

  /**
   * Full integration workflow: upload → create task → run → wait → get findings.
   */
  async auditReport(params: {
    reportContent: string;
    reportTitle: string;
    onProgress?: (stage: string, task?: AuditBeeTask) => void;
  }): Promise<{ task: AuditBeeTask; findings: AuditBeeFinding[] }> {
    log.info('Starting audit', { title: params.reportTitle });

    // Step 1: Upload report as document
    params.onProgress?.('上传报告到 AuditBee...');
    const blob = new Blob([params.reportContent], { type: 'text/markdown' });
    const { id: docId } = await this.uploadDocument(blob, `${params.reportTitle}.md`);
    log.info('Document uploaded', { docId, filename: `${params.reportTitle}.md` });

    // Step 2: Create audit task
    params.onProgress?.('创建审计任务...');
    const task = await this.createTask({
      taskName: `偏差报告审计 - ${params.reportTitle}`,
      taskType: 'deviation_analysis',
      documentIds: [docId],
    });
    log.info('Task created', { taskId: task.id });

    // Step 3: Run task
    params.onProgress?.('执行审计...', task);
    await this.runTask(task.id);
    log.info('Task started', { taskId: task.id });

    // Step 4: Wait for completion
    const completedTask = await this.waitForCompletion(task.id, {
      onProgress: (t) => params.onProgress?.('审计进行中...', t),
    });
    log.info('Task completed', { taskId: completedTask.id, status: completedTask.status });

    // Step 5: Get findings
    params.onProgress?.('获取审计结果...');
    const findings = await this.getFindings(completedTask.id);
    log.info('Audit finished', { taskId: completedTask.id, findings: findings.length });

    return { task: completedTask, findings };
  }
}
