/**
 * AuditBee API service for renderer process.
 * Wraps window.gmpilot.auditbee with typed interfaces.
 */

import type { AuditBeeFinding } from '../../core/integration/types';
import type { AuditTask } from '../../core/db/schema';
import type { DeviationReport } from '../../core/workflow/types';

export const auditbeeApi = {
  /** Check if AuditBee service is available */
  checkHealth: async (): Promise<{ available: boolean; error?: string }> => {
    if (!window.gmpilot?.auditbee) {
      return { available: false, error: 'Not in Electron' };
    }
    return window.gmpilot.auditbee.checkHealth();
  },

  /** Send a deviation report for audit */
  auditReport: async (params: {
    report: DeviationReport;
    reportId?: number;
  }): Promise<{ success: boolean; findings?: AuditBeeFinding[]; taskId?: number; error?: string }> => {
    if (!window.gmpilot?.auditbee) {
      return { success: false, error: 'Not in Electron' };
    }
    return window.gmpilot.auditbee.auditReport(params);
  },

  /** Get findings for a specific audit task */
  getFindings: async (taskId: number): Promise<{ success: boolean; findings?: AuditBeeFinding[]; error?: string }> => {
    if (!window.gmpilot?.auditbee) {
      return { success: false, error: 'Not in Electron' };
    }
    return window.gmpilot.auditbee.getFindings({ taskId });
  },

  /** Get audit task status */
  getTaskStatus: async (taskId: number): Promise<{ success: boolean; task?: unknown; error?: string }> => {
    if (!window.gmpilot?.auditbee) {
      return { success: false, error: 'Not in Electron' };
    }
    return window.gmpilot.auditbee.getTaskStatus({ taskId });
  },

  /** Get audit history for a report */
  getAuditHistory: async (reportId: number): Promise<AuditTask[]> => {
    if (!window.gmpilot?.auditbee) {
      return [];
    }
    return window.gmpilot.auditbee.getAuditHistory(reportId);
  },
};
