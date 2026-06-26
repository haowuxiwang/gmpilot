-- AuditBee 审计任务表
-- 存储审计历史和结果

CREATE TABLE IF NOT EXISTS audit_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  auditbee_task_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  findings_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_tasks_report_id ON audit_tasks(report_id);
CREATE INDEX IF NOT EXISTS idx_audit_tasks_status ON audit_tasks(status);
