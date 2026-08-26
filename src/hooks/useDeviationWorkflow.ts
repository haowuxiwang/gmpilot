/**
 * Custom hook for deviation report workflow.
 * Manages state, progress subscription, and actions (run, export, audit, reset).
 *
 * Optimized with useMemo/useCallback to minimize re-renders.
 */

import { useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import type { DeviationReport } from '@core/workflow/types';
import type { WorkflowProgress as PreloadWorkflowProgress } from '@core/types/ipc';

export type WorkflowStep = 'input' | 'analyzing' | 'identifying' | 'matching' | 'generating' | 'auditing' | 'review' | 'done';

export interface WorkflowProgress extends PreloadWorkflowProgress {
  streamingReport?: Partial<DeviationReport> | null;
}

// ============================================================================
// Module-level persistent store.
// 工作流状态存于模块单例而非 useState：AgentPage 是路由组件，切换导航会卸载
// 组件并重置 useState —— 用户切到"偏差报告"再回来时进行中的流程就"消失"了。
// 状态放模块级后跨路由存活；组件挂载时 useSyncExternalStore 重新订阅。
// ============================================================================

interface WorkflowStore {
  step: WorkflowStep;
  clueText: string;
  report: DeviationReport | null;
  error: string | null;
  loading: boolean;
  exporting: 'pdf' | 'docx' | null;
  progress: WorkflowProgress | null;
  auditFindings: unknown[] | null;
  auditScore: number | null;
  auditSummary: string | null;
}

const store: WorkflowStore = {
  step: 'input',
  clueText: '',
  report: null,
  error: null,
  loading: false,
  exporting: null,
  progress: null,
  auditFindings: null,
  auditScore: null,
  auditSummary: null,
};

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const fn of listeners) fn();
}

/** Update one or more store fields and notify subscribers. */
let version = 0;
function setStore(patch: Partial<WorkflowStore>): void {
  Object.assign(store, patch);
  version += 1;
  notifyListeners();
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

/** Test-only: reset the module store between tests (state is persistent by design). */
export function resetWorkflowStoreForTests(): void {
  Object.assign(store, {
    step: 'input' as WorkflowStep,
    clueText: '',
    report: null,
    error: null,
    loading: false,
    exporting: null,
    progress: null,
    auditFindings: null,
    auditScore: null,
    auditSummary: null,
  });
  version += 1;
}

/** Test-only: allow re-subscription (clears the app-lifetime singleton flag). */
export function resetWorkflowSubscriptionForTests(): void {
  (globalThis as { __wfSubscribed?: boolean }).__wfSubscribed = false;
}

export function useDeviationWorkflow(callbacks?: WorkflowCallbacks) {
  // 状态存模块级单例（跨路由持久）；useSyncExternalStore 订阅变更触发重渲染
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => version, // version 变化即触发重渲染
    () => version,
  );
  void snapshot; // 仅作为重渲染信号，字段直接从 store 读

  const step = store.step;
  const clueText = store.clueText;
  const report = store.report;
  const error = store.error;
  const loading = store.loading;
  const progress = store.progress;
  const auditFindings = store.auditFindings;
  const auditScore = store.auditScore;
  const auditSummary = store.auditSummary;
  const exporting = store.exporting;

  const setStep = useCallback((s: WorkflowStep) => setStore({ step: s }), []);
  const setClueText = useCallback((t: string) => setStore({ clueText: t }), []);
  const setError = useCallback((e: string | null) => setStore({ error: e }), []);

  // Use ref for callbacks to avoid stale closures
    const callbacksRef = useLatest(callbacks);

    // Subscribe to workflow progress — app-lifetime singleton.
    // 注意：不能用 useEffect+cleanup。AgentPage 切路由会卸载，cleanup 调
    // offProgress() 会把 IPC 监听全拆掉，工作流进行中切页再回来就收不到进度了
    // （正是"流程不持久"的第二个根因）。改为模块级一次性订阅。
    let subscribed = (globalThis as { __wfSubscribed?: boolean }).__wfSubscribed;
    if (!subscribed && typeof window !== 'undefined' && window.gmpilot) {
      subscribed = true;
      (globalThis as { __wfSubscribed?: boolean }).__wfSubscribed = true;

      const handleProgress = (data: PreloadWorkflowProgress) => {
        setStore({
          progress: { ...data, streamingReport: store.progress?.streamingReport },
        });
        if (data.currentStep) {
          const stepNames: WorkflowStep[] = ['input', 'analyzing', 'identifying', 'matching', 'generating', 'auditing', 'review'];
          setStore({ step: stepNames[data.currentStep - 1] || 'input' });
        }
        if (data.report) {
          setStore({ report: data.report });
        }
        if (data.error) {
          setStore({ error: data.error });
        }
      };

      const handleStreaming = (data: { partial: Partial<DeviationReport> }) => {
        if (data.partial) {
          setStore({
            progress: store.progress ? { ...store.progress, streamingReport: data.partial } : null,
          });
        }
      };

      window.gmpilot.workflow.onProgress(handleProgress);
      window.gmpilot.workflow.onStreaming(handleStreaming);
      // 不调用 offProgress/offStreaming —— 监听器与应用同生命周期
    }

  // Run workflow
  const runWorkflow = useCallback(async (text?: string, files?: { name: string; content?: string }[]): Promise<WorkflowResult | undefined> => {
    const clue = text || clueText;
    if (!clue.trim()) {
      callbacksRef.current?.onWarning?.('请输入偏差线索');
      return { success: false, error: '请输入偏差线索' };
    }

    setStore({ loading: true });
    setError(null);
    setStore({ step: 'analyzing' });

    try {
      if (typeof window === 'undefined' || !window.gmpilot) {
        callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
        setStore({ step: 'input' });
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
        setStore({ report: result.report as DeviationReport });
        setStore({ auditFindings: (result.auditFindings ?? null) as unknown[] | null });
        setStore({ auditScore: result.auditScore ?? null });
        setStore({ auditSummary: result.auditSummary ?? null });
        setStore({ step: 'review' });
        callbacksRef.current?.onSuccess?.(result.report as DeviationReport);
        return { success: true, report: result.report as DeviationReport, auditFindings: result.auditFindings, auditScore: result.auditScore, auditSummary: result.auditSummary, fallbackModules: result.fallbackModules };
      } else {
        const errorMsg = result.error || '工作流执行失败';
        setStore({ progress: null });
        setError(errorMsg);
        setStore({ step: 'input' });
        callbacksRef.current?.onError?.(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = String(err);
      setStore({ progress: null });
      setError(errorMsg);
      setStore({ step: 'input' });
      callbacksRef.current?.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setStore({ loading: false });
    }
  }, [clueText, callbacksRef]);

  // Export PDF
  const exportPdf = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    setStore({ exporting: 'pdf' });
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
      setStore({ exporting: null });
    }
  }, [report, callbacksRef]);

  // Export Word (fill factory template)
  const exportDocx = useCallback(async () => {
    if (!report) return;
    if (typeof window === 'undefined' || !window.gmpilot) {
      callbacksRef.current?.onWarning?.('请在 Electron 环境中运行');
      return;
    }

    setStore({ exporting: 'docx' });
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
      setStore({ exporting: null });
    }
  }, [report, callbacksRef]);

  // Cancel running workflow
  const cancelWorkflow = useCallback(async () => {
    if (typeof window === 'undefined' || !window.gmpilot) return;
    try {
      const result = await window.gmpilot.workflow.cancel();
      if (result.success) {
        setStore({ loading: false });
        setStore({ step: 'input' });
        setError('工作流已被用户取消');
        setStore({ progress: null });
      }
    } catch {
      // Ignore cancel errors
    }
  }, []);

  // Reset
  const reset = useCallback(() => {
    setStore({
      step: 'input',
      clueText: '',
      report: null,
      error: null,
      progress: null,
      auditFindings: null,
      auditScore: null,
      auditSummary: null,
    });
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

    setStore({ loading: true });
    setError(null);

    try {
      const result = await window.gmpilot.workflow.reviseTargeted({
        report,
        targets,
        revisionContext,
      });

      if (result.success && result.report) {
        setStore({ report: result.report as DeviationReport });
        // 修订后更新重新审计结果（IPC 层已完成审计）
        if (result.auditFindings !== undefined) setStore({ auditFindings: result.auditFindings });
        if (result.auditScore !== undefined) setStore({ auditScore: result.auditScore });
        if (result.auditSummary !== undefined) setStore({ auditSummary: result.auditSummary });
        setStore({ step: 'review' });
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
      setStore({ loading: false });
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
