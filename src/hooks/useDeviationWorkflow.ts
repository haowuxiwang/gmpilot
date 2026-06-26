/**
 * Custom hook for deviation report workflow.
 * Manages state, progress subscription, and actions (run, export, audit, reset).
 *
 * No external UI library dependencies - uses console for fallback notifications.
 * UI layer should provide its own notification system.
 */

import { useState, useCallback, useEffect } from 'react';
import type { DeviationReport } from '@core/workflow/types';
import type { WorkflowProgress as PreloadWorkflowProgress } from '@core/types/ipc';

export type WorkflowStep = 'input' | 'analyzing' | 'identifying' | 'matching' | 'generating' | 'review' | 'done';

export interface WorkflowProgress extends PreloadWorkflowProgress {
  // 优化2: 流式报告内容
  streamingReport?: Partial<DeviationReport> | null;
}

export const STEP_MAP: Record<WorkflowStep, number> = {
  input: 0,
  analyzing: 1,
  identifying: 2,
  matching: 3,
  generating: 4,
  review: 5,
  done: 5,
};

export interface WorkflowResult {
  success: boolean;
  report?: DeviationReport;
  error?: string;
}

export interface WorkflowCallbacks {
  onSuccess?: (report: DeviationReport) => void;
  onError?: (error: string) => void;
  onWarning?: (message: string) => void;
}

export function useDeviationWorkflow(callbacks?: WorkflowCallbacks) {
  const [step, setStep] = useState<WorkflowStep>('input');
  const [clueText, setClueText] = useState('');
  const [report, setReport] = useState<DeviationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFindings, setAuditFindings] = useState<unknown[] | null>(null);

  // Subscribe to workflow progress
  useEffect(() => {
    const handleProgress = (data: PreloadWorkflowProgress) => {
      // M-2 fix: Preserve streamingReport when progress updates
      setProgress((prev) => ({
        ...data,
        streamingReport: prev?.streamingReport,
      }));
      if (data.currentStep) {
        const stepNames: WorkflowStep[] = ['input', 'analyzing', 'identifying', 'matching', 'generating', 'review'];
        setStep(stepNames[data.currentStep - 1] || 'input');
      }
      if (data.report) {
        setReport(data.report);
      }
      if (data.error) {
        setError(data.error);
      }
    };

    // 优化2: 订阅流式报告内容
    const handleStreaming = (data: { partial: Partial<DeviationReport> }) => {
      if (data.partial) {
        setProgress((prev) => prev ? { ...prev, streamingReport: data.partial } : prev);
      }
    };

    if (typeof window !== 'undefined' && window.gmpilot) {
      window.gmpilot.workflow.onProgress(handleProgress);
      window.gmpilot.workflow.onStreaming(handleStreaming);
      return () => {
        window.gmpilot.workflow.offProgress();
        window.gmpilot.workflow.offStreaming();
      };
    }
  }, []);

  // Run workflow
  const runWorkflow = useCallback(async (text?: string, files?: { name: string; content?: string }[]): Promise<WorkflowResult | undefined> => {
    const clue = text || clueText;
    if (!clue.trim()) {
      callbacks?.onWarning?.('请输入偏差线索');
      return { success: false, error: '请输入偏差线索' };
    }

    setLoading(true);
    setError(null);
    setStep('analyzing');

    try {
      if (typeof window === 'undefined' || !window.gmpilot) {
        callbacks?.onWarning?.('请在 Electron 环境中运行');
        setStep('input');
        return { success: false, error: '请在 Electron 环境中运行' };
      }

      const result = await window.gmpilot.workflow.runDeviation(clue, files);

      if (result.success && result.report) {
        setReport(result.report as DeviationReport);
        setStep('review');
        callbacks?.onSuccess?.(result.report as DeviationReport);
        return { success: true, report: result.report as DeviationReport };
      } else {
        const errorMsg = result.error || '工作流执行失败';
        setProgress(null);  // Clear stale streaming data
        setError(errorMsg);
        setStep('input');
        callbacks?.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = String(err);
      setProgress(null);  // Clear stale streaming data
      setError(errorMsg);
      setStep('input');
      callbacks?.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [clueText, callbacks]);

  // Export PDF
  const exportPdf = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacks?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    try {
      const result = await window.gmpilot.file.exportPdf(report);
      if (result.success) {
        callbacks?.onSuccess?.(report);
      } else if (result.error) {
        callbacks?.onError?.(`导出失败：${result.error}`);
      }
    } catch (err) {
      callbacks?.onError?.(`导出失败：${err}`);
    }
  }, [report, callbacks]);

  // Send to AuditBee for audit
  const sendToAuditBee = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacks?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    setAuditLoading(true);
    setAuditFindings(null);

    try {
      const result = await window.gmpilot.auditbee.auditReport({ report });

      if (result.success && result.findings) {
        setAuditFindings(result.findings);
      } else {
        callbacks?.onError?.(`审计失败：${result.error || '未知错误'}`);
      }
    } catch (err) {
      callbacks?.onError?.(`审计失败：${err}`);
    } finally {
      setAuditLoading(false);
    }
  }, [report, callbacks]);

  // Reset
  const reset = useCallback(() => {
    setStep('input');
    setClueText('');
    setReport(null);
    setError(null);
    setProgress(null);
    setAuditFindings(null);
  }, []);

  return {
    // State
    step,
    clueText,
    report,
    error,
    loading,
    progress,
    auditLoading,
    auditFindings,
    // Actions
    setClueText,
    setStep,
    setError,
    runWorkflow,
    exportPdf,
    sendToAuditBee,
    reset,
  };
}
