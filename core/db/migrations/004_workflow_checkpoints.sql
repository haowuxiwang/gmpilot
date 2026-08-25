-- 工作流检查点表（崩溃恢复）

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  correlation_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
