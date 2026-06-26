/**
 * AuditBee API types for integration.
 * Aligned with AuditBee's API response shapes.
 */

export interface AuditBeeTask {
  id: number;
  task_name: string;
  task_type: string;
  status: 'pending' | 'running' | 'awaiting_review' | 'rejected' | 'cancelled' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface AuditBeeFinding {
  id: number;
  finding_type: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence: string | null;
  suggestion: string | null;
  location: string | null;
  regulation_ref: string | null;
  document_id: number | null;
  created_at: string;
}

export interface AuditBeeReport {
  id: number;
  task_id: number;
  report_type: string;
  title: string;
  content: string | null;
  report_metadata: Record<string, unknown> | null;
  created_at: string;
}
