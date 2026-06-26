/**
 * useAuditBee - Hook for AuditBee integration.
 * Manages audit lifecycle: health check, progress tracking, findings, and history.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { auditbeeApi } from '../services/auditbee-api';
import type { AuditBeeFinding } from '../../core/integration/types';
import type { AuditTask } from '../../core/db/schema';
import type { DeviationReport } from '../../core/workflow/types';
import type { AuditBeeProgress } from '@core/types/ipc';

// ============================================================================
// Types
// ============================================================================

export type AuditStage = 'idle' | 'uploading' | 'creating' | 'running' | 'completed' | 'failed';

export interface AuditState {
  /** Whether an audit is in progress */
  loading: boolean;
  /** Current audit stage */
  stage: AuditStage;
  /** AuditBee task progress (0-100) */
  progress: number;
  /** Audit findings from AuditBee */
  findings: AuditBeeFinding[] | null;
  /** AuditBee task ID */
  taskId: number | null;
  /** Error message if audit failed */
  error: string | null;
  /** Whether AuditBee service is available */
  isAvailable: boolean | null;
  /** Audit history for the current report */
  history: AuditTask[];
}

// ============================================================================
// Hook
// ============================================================================

export function useAuditBee(
  report: DeviationReport | null,
  reportId?: number,
  onRevise?: (revisionPrompt: string) => void,
) {
  const [state, setState] = useState<AuditState>({
    loading: false,
    stage: 'idle',
    progress: 0,
    findings: null,
    taskId: null,
    error: null,
    isAvailable: null,
    history: [],
  });

  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to auditbee:progress events
  useEffect(() => {
    const handleProgress = (data: AuditBeeProgress) => {
      if (!mountedRef.current) return;

      const progressPercent = data.task?.progress ?? 0;

      setState((prev) => ({
        ...prev,
        stage: data.stage,
        progress: data.stage === 'completed' ? 100 : progressPercent,
        error: data.error ?? null,
        // Auto-transition to completed when stage is 'completed'
        loading: data.stage !== 'completed' && data.stage !== 'failed',
      }));
    };

    window.gmpilot?.auditbee?.onProgress(handleProgress);
    return () => {
      window.gmpilot?.auditbee?.offProgress();
    };
  }, []);

  // Check AuditBee health on mount
  const checkHealth = useCallback(async () => {
    try {
      const result = await auditbeeApi.checkHealth();
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isAvailable: result.available }));
      }
    } catch {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isAvailable: false }));
      }
    }
  }, []);

  // Load audit history for the current report
  const loadHistory = useCallback(async () => {
    if (!reportId) return;
    try {
      const history = await auditbeeApi.getAuditHistory(reportId);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, history }));
      }
    } catch {
      // Non-fatal
    }
  }, [reportId]);

  // Check health and load history on mount/reportId change
  useEffect(() => {
    checkHealth();
    loadHistory();
  }, [checkHealth, loadHistory]);

  // Send report for audit
  const sendToAudit = useCallback(async () => {
    if (!report) return;

    setState((prev) => ({
      ...prev,
      loading: true,
      stage: 'uploading',
      progress: 0,
      findings: null,
      taskId: null,
      error: null,
    }));

    try {
      const result = await auditbeeApi.auditReport({ report, reportId });

      if (!mountedRef.current) return;

      if (result.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          stage: 'completed',
          progress: 100,
          findings: result.findings ?? null,
          taskId: result.taskId ?? null,
        }));
        // Reload history after successful audit
        loadHistory();
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          stage: 'failed',
          error: result.error ?? '审计失败',
        }));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        stage: 'failed',
        error: error instanceof Error ? error.message : '审计请求失败',
      }));
    }
  }, [report, reportId, loadHistory]);

  // Reset audit state (but keep health and history)
  const resetAudit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      loading: false,
      stage: 'idle',
      progress: 0,
      findings: null,
      taskId: null,
      error: null,
    }));
  }, []);

  // Revise report based on audit findings
  const reviseWithFindings = useCallback(() => {
    const currentFindings = state.findings;
    if (!currentFindings || currentFindings.length === 0 || !onRevise) return;

    // Format findings into a revision prompt
    const findingsText = currentFindings
      .map((f, i) => {
        const parts = [`${i + 1}. [${f.severity}] ${f.title}`];
        if (f.description) parts.push(`   问题: ${f.description}`);
        if (f.suggestion) parts.push(`   建议: ${f.suggestion}`);
        if (f.regulation_ref) parts.push(`   法规依据: ${f.regulation_ref}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const revisionPrompt = [
      '请根据以下审计发现修订偏差报告：',
      '',
      findingsText,
      '',
      '请针对上述每个问题进行修正，确保报告内容完整、准确、符合GMP要求。',
    ].join('\n');

    onRevise(revisionPrompt);
  }, [state.findings, onRevise]);

  // Compute severity counts from findings
  const severityCounts = state.findings
    ? state.findings.reduce(
        (acc, f) => {
          acc[f.severity] = (acc[f.severity] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : null;

  return {
    ...state,
    severityCounts,
    sendToAudit,
    resetAudit,
    reviseWithFindings,
    checkHealth,
    loadHistory,
  };
}
