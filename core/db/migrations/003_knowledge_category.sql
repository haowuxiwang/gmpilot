-- 知识库文档分类支持
-- category: sop (标准操作规程) | deviation (历史偏差) | regulation (法规)

ALTER TABLE knowledge_docs ADD COLUMN category TEXT DEFAULT 'regulation';

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category ON knowledge_docs(category);
