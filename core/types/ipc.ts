/**
 * Shared IPC types used by both main process and renderer.
 * Extracted from electron/preload.ts to avoid cross-layer imports.
 */

import type { ClueAnalysis, Factor5M1E, RegulationMatch, Finding, DeviationReport } from '../workflow/types';

export interface WorkflowProgress {
  step: string;
  currentStep: number;
  analysis: ClueAnalysis | null;
  factors: Factor5M1E | null;
  regulations: RegulationMatch[];
  findings: Finding[];
  report: DeviationReport | null;
  error: string | null;
  auditFindings?: unknown[];
  auditScore?: number;
  auditSummary?: string;
}
