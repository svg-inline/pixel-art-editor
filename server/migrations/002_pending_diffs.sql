CREATE TABLE IF NOT EXISTS pending_diffs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  command_json TEXT,
  diff_json TEXT NOT NULL,
  preview_project_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_diffs_project_at
  ON pending_diffs(project_id, at DESC);
