-- GMPilot 初始数据库迁移
-- 对齐 AuditBee 数据模型

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 报告表 — 对齐 AuditBee reports 表
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  deviation_id TEXT,
  deviation_type TEXT NOT NULL DEFAULT 'deviation_analysis',
  content TEXT NOT NULL,
  clue_input TEXT,
  factors_json TEXT,
  regulations_json TEXT,
  findings_json TEXT,
  risk_score INTEGER DEFAULT -1,
  risk_level TEXT DEFAULT 'low',
  report_metadata_json TEXT,
  pdf_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识库文档表
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'builtin',
  content TEXT NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  indexed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_deviation_type ON reports(deviation_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source ON knowledge_docs(source);
