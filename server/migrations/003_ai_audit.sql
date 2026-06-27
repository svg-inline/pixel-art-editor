CREATE TABLE IF NOT EXISTS ai_audit (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  prompt TEXT NOT NULL,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_kind TEXT NOT NULL,
  model TEXT,
  result TEXT NOT NULL,
  diff_json TEXT,
  summary_json TEXT,
  warnings_json TEXT,
  error TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_project_at
  ON ai_audit(project_id, at DESC);
