/**
 * Database schema and typed CRUD operations.
 * Aligned with AuditBee data models.
 */

import type Database from 'better-sqlite3';
import { createLogger } from '../utils/logger';

const log = createLogger('DB');

// ============================================================================
// Types
// ============================================================================

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface Report {
  id: number;
  title: string;
  deviation_id: string | null;
  deviation_type: string;
  content: string;
  clue_input: string | null;
  factors_json: string | null;
  regulations_json: string | null;
  findings_json: string | null;
  risk_score: number;
  risk_level: 'high' | 'medium' | 'low';
  report_metadata_json: string | null;
  pdf_path: string | null;
  created_at: string;
}

export interface ReportInsert {
  title: string;
  deviation_id?: string;
  deviation_type?: string;
  content: string;
  clue_input?: string;
  factors_json?: string;
  regulations_json?: string;
  findings_json?: string;
  risk_score?: number;
  risk_level?: string;
  report_metadata_json?: string;
  pdf_path?: string;
}

export interface KnowledgeDoc {
  id: number;
  filename: string;
  source: string;
  category: string;
  content: string;
  chunk_count: number;
  indexed_at: string | null;
  created_at: string;
}

export interface AuditTask {
  id: number;
  report_id: number;
  auditbee_task_id: number;
  status: string;
  findings_json: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AuditTaskInsert {
  report_id: number;
  auditbee_task_id: number;
  status?: string;
  findings_json?: string;
}

export interface Conversation {
  id: number;
  title: string;
  messages_json: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationInsert {
  title: string;
  messages_json: string;
}

// ============================================================================
// Settings CRUD
// ============================================================================

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Setting[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  ).run(key, value);
}

export function setSettings(db: Database.Database, settings: Record<string, string>): void {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      upsert.run(key, value);
    }
  });
  tx();
}

// ============================================================================
// Reports CRUD
// ============================================================================

export function getReports(db: Database.Database, limit = 50, offset = 0): Report[] {
  return db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Report[];
}

/**
 * Report list item — excludes large text columns (content/clue_input/JSON columns).
 * 列表页只需要元数据；content 可达数百 KB，SELECT * 会在报告增多后拖慢列表加载。
 * 需要全文时用 getReport(id) 按需获取。
 */
export interface ReportSummary {
  id: number;
  title: string;
  deviation_id: string | null;
  deviation_type: string;
  risk_score: number;
  risk_level: 'high' | 'medium' | 'low';
  created_at: string;
}

const REPORT_SUMMARY_COLUMNS = 'id, title, deviation_id, deviation_type, risk_score, risk_level, created_at';

export function getReportSummaries(db: Database.Database, limit = 50, offset = 0): ReportSummary[] {
  return db
    .prepare(`SELECT ${REPORT_SUMMARY_COLUMNS} FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as ReportSummary[];
}

export function getReport(db: Database.Database, id: number): Report | null {
  return (db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Report) ?? null;
}

export function createReport(db: Database.Database, report: ReportInsert): number {
  const result = db.prepare(`
    INSERT INTO reports (title, deviation_id, deviation_type, content, clue_input, factors_json, regulations_json, findings_json, risk_score, risk_level, report_metadata_json, pdf_path)
    VALUES (@title, @deviation_id, @deviation_type, @content, @clue_input, @factors_json, @regulations_json, @findings_json, @risk_score, @risk_level, @report_metadata_json, @pdf_path)
  `).run({
    title: report.title,
    deviation_id: report.deviation_id ?? null,
    deviation_type: report.deviation_type ?? 'deviation_analysis',
    content: report.content,
    clue_input: report.clue_input ?? null,
    factors_json: report.factors_json ?? null,
    regulations_json: report.regulations_json ?? null,
    findings_json: report.findings_json ?? null,
    risk_score: report.risk_score ?? -1,
    risk_level: report.risk_level ?? 'low',
    report_metadata_json: report.report_metadata_json ?? null,
    pdf_path: report.pdf_path ?? null,
  });
  const id = Number(result.lastInsertRowid);
  log.info('Report created', { id, title: report.title, deviationId: report.deviation_id });
  return id;
}

export function updateReportPdf(db: Database.Database, id: number, pdfPath: string): void {
  db.prepare('UPDATE reports SET pdf_path = ? WHERE id = ?').run(pdfPath, id);
}

export function deleteReport(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  log.info('Report deleted', { id });
}

// ============================================================================
// Knowledge Docs CRUD
// ============================================================================

export function getKnowledgeDocs(db: Database.Database, source?: string, category?: string): KnowledgeDoc[] {
  let sql = 'SELECT id, filename, source, category, chunk_count, indexed_at, created_at FROM knowledge_docs';
  const conditions: string[] = [];
  const params: string[] = [];
  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY source, filename';
  return db.prepare(sql).all(...params) as KnowledgeDoc[];
}

export function getKnowledgeDoc(db: Database.Database, id: number): KnowledgeDoc | null {
  return (db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(id) as KnowledgeDoc) ?? null;
}

export function createKnowledgeDoc(db: Database.Database, doc: { filename: string; source: string; content: string; category?: string }): number {
  const result = db.prepare(
    'INSERT INTO knowledge_docs (filename, source, content, category) VALUES (?, ?, ?, ?)'
  ).run(doc.filename, doc.source, doc.content, doc.category || 'regulation');
  const id = Number(result.lastInsertRowid);
  log.info('Knowledge doc created', { id, filename: doc.filename, source: doc.source, category: doc.category || 'regulation', contentLength: doc.content.length });
  return id;
}

export function updateKnowledgeDocIndex(db: Database.Database, id: number, chunkCount: number): void {
  db.prepare('UPDATE knowledge_docs SET chunk_count = ?, indexed_at = CURRENT_TIMESTAMP WHERE id = ?').run(chunkCount, id);
}

export function deleteKnowledgeDoc(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id);
  log.info('Knowledge doc deleted', { id });
}

export function getKnowledgeDocIdsByCategories(db: Database.Database, categories: string[]): number[] {
  if (categories.length === 0) return [];
  const placeholders = categories.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT id FROM knowledge_docs WHERE category IN (${placeholders})`
  ).all(...categories) as { id: number }[];
  return rows.map(r => r.id);
}

// ============================================================================
// Audit Tasks CRUD
// ============================================================================

export function getAuditTasksByReport(db: Database.Database, reportId: number): AuditTask[] {
  return db.prepare('SELECT * FROM audit_tasks WHERE report_id = ? ORDER BY created_at DESC').all(reportId) as AuditTask[];
}

export function getAuditTask(db: Database.Database, id: number): AuditTask | null {
  return (db.prepare('SELECT * FROM audit_tasks WHERE id = ?').get(id) as AuditTask) ?? null;
}

export function createAuditTask(db: Database.Database, task: AuditTaskInsert): number {
  const result = db.prepare(`
    INSERT INTO audit_tasks (report_id, auditbee_task_id, status, findings_json)
    VALUES (@report_id, @auditbee_task_id, @status, @findings_json)
  `).run({
    report_id: task.report_id,
    auditbee_task_id: task.auditbee_task_id,
    status: task.status ?? 'pending',
    findings_json: task.findings_json ?? null,
  });
  const id = Number(result.lastInsertRowid);
  log.info('Audit task created', { id, reportId: task.report_id, auditbeeTaskId: task.auditbee_task_id });
  return id;
}

export function updateAuditTaskResult(db: Database.Database, id: number, status: string, findingsJson: string): void {
  db.prepare(
    'UPDATE audit_tasks SET status = ?, findings_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(status, findingsJson, id);
  log.info('Audit task updated', { id, status });
}

export function deleteAuditTask(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM audit_tasks WHERE id = ?').run(id);
}

// ============================================================================
// Conversations CRUD
// ============================================================================

export function getConversations(db: Database.Database, limit = 50, offset = 0): Conversation[] {
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Conversation[];
}

export function getConversation(db: Database.Database, id: number): Conversation | null {
  return (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation) ?? null;
}

export function createConversation(db: Database.Database, conversation: ConversationInsert): number {
  const result = db.prepare(`
    INSERT INTO conversations (title, messages_json)
    VALUES (@title, @messages_json)
  `).run({
    title: conversation.title,
    messages_json: conversation.messages_json,
  });
  const id = Number(result.lastInsertRowid);
  log.info('Conversation created', { id, title: conversation.title });
  return id;
}

export function updateConversation(db: Database.Database, id: number, title: string, messagesJson: string): void {
  db.prepare(`
    UPDATE conversations 
    SET title = ?, messages_json = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(title, messagesJson, id);
}

export function deleteConversation(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  log.info('Conversation deleted', { id });
}

// ============================================================================
// Workflow Checkpoints (crash recovery)
// ============================================================================

export interface WorkflowCheckpoint {
  correlation_id: string;
  step: string;
  context_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Save or update a workflow checkpoint for crash recovery.
 * Non-fatal: errors are logged but do not interrupt the workflow.
 */
export function saveCheckpoint(db: Database.Database, correlationId: string, step: string, context: Record<string, unknown>): void {
  try {
    db.prepare(`
      INSERT INTO workflow_checkpoints (correlation_id, step, context_json, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(correlation_id) DO UPDATE SET
        step = excluded.step,
        context_json = excluded.context_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(correlationId, step, JSON.stringify(context));
  } catch (error) {
    log.warn('Failed to save workflow checkpoint (non-fatal)', { correlationId, step, error: String(error) });
  }
}

/**
 * Load a workflow checkpoint for recovery.
 */
export function loadCheckpoint(db: Database.Database, correlationId: string): WorkflowCheckpoint | null {
  const row = db.prepare('SELECT * FROM workflow_checkpoints WHERE correlation_id = ?').get(correlationId) as WorkflowCheckpoint | undefined;
  return row ?? null;
}

/**
 * Delete a workflow checkpoint after successful completion.
 */
export function deleteCheckpoint(db: Database.Database, correlationId: string): void {
  try {
    db.prepare('DELETE FROM workflow_checkpoints WHERE correlation_id = ?').run(correlationId);
  } catch (error) {
    log.warn('Failed to delete checkpoint (non-fatal)', { correlationId, error: String(error) });
  }
}
