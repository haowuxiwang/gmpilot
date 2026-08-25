/**
 * Custom hook for deviation report workflow.
 * Manages state, progress subscription, and actions (run, export, audit, reset).
 *
 * Optimized with useMemo/useCallback to minimize re-renders.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DeviationReport } from '@core/workflow/types';
import type { WorkflowProgress as PreloadWorkflowProgress } from '@core/types/ipc';

export type WorkflowStep = 'input' | 'analyzing' | 'identifying' | 'matching' | 'generating' | 'auditing' | 'review' | 'done';

export interface WorkflowProgress extends PreloadWorkflowProgress {
  streamingReport?: Partial<DeviationReport> | null;
}

export const STEP_MAP: Record<WorkflowStep, number> = {
  input: 0,
  analyzing: 1,
  identifying: 2,
  matching: 3,
  generating: 4,
  auditing: 5,
  review: 6,
  done: 6,
};

export interface WorkflowResult {
  success: boolean;
  report?: DeviationReport;
  auditFindings?: unknown[];
  auditScore?: number;
  auditSummary?: string;
  fallbackModules?: string[];
  error?: string;
}

export interface WorkflowCallbacks {
  onSuccess?: (report: DeviationReport) => void;
  onError?: (error: string) => void;
  onWarning?: (message: string) => void;
  /** 导出完成后回调（type: pdf | docx） */
  onExported?: (type: 'pdf' | 'docx', filePath?: string) => void;
}

// Stable callback ref to avoid re-renders
function useLatest<T>(callback: T): React.MutableRefObject<T> {
  const ref = useRef<T>(callback);
  ref.current = callback;
  return ref;
}

export function useDeviationWorkflow(callbacks?: WorkflowCallbacks) {
  const [step, setStep] = useState<WorkflowStep>('input');
  const [clueText, setClueText] = useState('');
  const [report, setReport] = useState<DeviationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const [auditFindings, setAuditFindings] = useState<unknown[] | null>(null);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [auditSummary, setAuditSummary] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  // Use ref for callbacks to avoid stale closures
  const callbacksRef = useLatest(callbacks);

  // Subscribe to workflow progress (stable - runs once)
  useEffect(() => {
    const handleProgress = (data: PreloadWorkflowProgress) => {
      setProgress((prev) => ({
        ...data,
        streamingReport: prev?.streamingReport,
      }));
      if (data.currentStep) {
        const stepNames: WorkflowStep[] = ['input', 'analyzing', 'identifying', 'matching', 'generating', 'auditing', 'review'];
        setStep(stepNames[data.currentStep - 1] || 'input');
      }
      if (data.report) {
        setReport(data.report);
      }
      if (data.error) {
        setError(data.error);
      }
    };

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
      callbacksRef.current?.onWarning?.('请输入偏差线索');
      return { success: false, error: '请输入偏差线索' };
    }

    setLoading(true);
    setError(null);
    setStep('analyzing');

    try {
      if (typeof window === 'undefined' || !window.gmpilot) {
        callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
        setStep('input');
        return { success: false, error: '请在 Electron 环境中运行' };
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const result = await Promise.race([
        window.gmpilot.workflow.runDeviation(clue, files),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('前端超时：工作流未在预期时间内完成，请重试')), 10.5 * 60 * 1000);
        }),
      ]);
      clearTimeout(timeoutId!);

      if (result.success && result.report) {
        setReport(result.report as DeviationReport);
        setAuditFindings(result.auditFindings ?? null);
        setAuditScore(result.auditScore ?? null);
        setAuditSummary(result.auditSummary ?? null);
        setStep('review');
        callbacksRef.current?.onSuccess?.(result.report as DeviationReport);
        return { success: true, report: result.report as DeviationReport, auditFindings: result.auditFindings, auditScore: result.auditScore, auditSummary: result.auditSummary, fallbackModules: result.fallbackModules };
      } else {
        const errorMsg = result.error || '工作流执行失败';
        setProgress(null);
        setError(errorMsg);
        setStep('input');
        callbacksRef.current?.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = String(err);
      setProgress(null);
      setError(errorMsg);
      setStep('input');
      callbacksRef.current?.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [clueText, callbacksRef]);

  // Export PDF
  const exportPdf = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    setExporting('pdf');
    try {
      const result = await window.gmpilot.file.exportPdf(report);
      if (result.success) {
        callbacksRef.current?.onExported?.('pdf', result.filePath);
      } else if (result.error) {
        callbacksRef.current?.onError?.(`导出失败：${result.error}`);
      }
    } catch (err) {
      callbacksRef.current?.onError?.(`导出失败：${err}`);
    } finally {
      setExporting(null);
    }
  }, [report, callbacksRef]);

  // Export Word (fill factory template)
  const exportDocx = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    setExporting('docx');
    try {
      const result = await window.gmpilot.file.exportDocx(report);
      if (result.success) {
        callbacksRef.current?.onExported?.('docx', result.filePath);
      } else if (result.error) {
        callbacksRef.current?.onError?.(`导出失败：${result.error}`);
      }
    } catch (err) {
      callbacksRef.current?.onError?.(`导出失败：${err}`);
    } finally {
      setExporting(null);
    }
  }, [report, callbacksRef]);

  // Cancel running workflow
  const cancelWorkflow = useCallback(async () => {
    if (typeof window === 'undefined' || !window.gmpilot) return;
    try {
      const result = await window.gmpilot.workflow.cancel();
      if (result.success) {
        setLoading(false);
        setStep('input');
        setError('工作流已被用户取消');
        setProgress(null);
      }
    } catch {
      // Ignore cancel errors
    }
  }, []);

  // Reset
  const reset = useCallback(() => {
    setStep('input');
    setClueText('');
    setReport(null);
    setError(null);
    setProgress(null);
    setAuditFindings(null);
    setAuditScore(null);
    setAuditSummary(null);
  }, []);

  // Targeted module revision
  const reviseTargeted = useCallback(async (
    targets: string[],
    revisionContext: string,
  ): Promise<{ success: boolean; report?: DeviationReport; fallbackModules?: string[]; auditFindings?: unknown[]; auditScore?: number; auditSummary?: string; error?: string }> => {
    if (!report) {
      return { success: false, error: '没有可修订的报告' };
    }
    if (typeof window === 'undefined' || !window.gmpilot) {
      return { success: false, error: '请在 Electron 环境中运行' };
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.gmpilot.workflow.reviseTargeted({
        report,
        targets,
        revisionContext,
      });

      if (result.success && result.report) {
        setReport(result.report as DeviationReport);
        // 修订后更新重新审计结果（IPC 层已完成审计）
        if (result.auditFindings !== undefined) setAuditFindings(result.auditFindings as never);
        if (result.auditScore !== undefined) setAuditScore(result.auditScore as never);
        if (result.auditSummary !== undefined) setAuditSummary(result.auditSummary);
        setStep('review');
        callbacksRef.current?.onSuccess?.(result.report as DeviationReport);
        return {
          success: true,
          report: result.report as DeviationReport,
          fallbackModules: result.fallbackModules,
          auditFindings: result.auditFindings,
          auditScore: result.auditScore,
          auditSummary: result.auditSummary,
        };
      } else {
        const errorMsg = result.error || '定向修订失败';
        setError(errorMsg);
        callbacksRef.current?.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      callbacksRef.current?.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [report, callbacksRef]);

  // Memoize return value to prevent unnecessary re-renders in consumers
  return useMemo(() => ({
    step,
    clueText,
    report,
    error,
    loading,
    exporting,
    progress,
    auditFindings,
    auditScore,
    auditSummary,
    setClueText,
    setStep,
    setError,
    runWorkflow,
    cancelWorkflow,
    exportPdf,
    exportDocx,
    reviseTargeted,
    reset,
  }), [
    step, clueText, report, error, loading, exporting, progress,
    auditFindings, auditScore, auditSummary,
    setClueText, setStep, setError,
    runWorkflow, cancelWorkflow, exportPdf, exportDocx, reviseTargeted, reset,
  ]);
}
