import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  activeAssetOf,
  compactProject,
  expandProject,
  type Project,
} from "../shared/pixel-core.ts";
import {
  createProjectCommand,
  HISTORY_LIMIT,
  isHistoryCommand,
  type HistoryCommand,
  type HistoryCommandName,
} from "../shared/history.ts";
import {
  previewProjectDiff,
  type ProjectDiffSummary,
} from "../shared/diff.ts";
import type { McpCommand, ProjectDiff } from "../shared/schema.ts";

type RepositoryOptions = {
  legacyProjectPath?: string;
  legacyDbPath?: string;
};
type SaveProjectOptions = {
  addHistory?: boolean;
  historyType?: HistoryCommandName;
  historyParams?: Record<string, unknown>;
  historySource?: string;
};
type GalleryProjectInput = {
  id?: string;
  name?: string;
  at?: string;
  project: unknown;
  thumbnailBase64?: string;
};
type UserInput = {
  email?: string;
  name?: string;
};
type PendingDiffInput = {
  id?: string;
  source?: string;
  diff: ProjectDiff;
  command?: McpCommand;
};
export type PendingProjectDiff = {
  id: string;
  at: string;
  source: string;
  command?: McpCommand;
  diff: ProjectDiff;
  project: Project;
  summary: ProjectDiffSummary;
};

const ACTIVE_PROJECT_ID = "active";

function now() {
  return new Date().toISOString();
}

function uid() {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readJson(filePath: string | undefined, fallback: any) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  return text.trim() ? JSON.parse(text) : fallback;
}

function migrationsDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
}

export class ProjectRepository {
  private db: DatabaseSync;

  constructor(
    public dbPath: string,
    private options: RepositoryOptions = {},
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.applyMigrations();
    this.migrateLegacyJson();
  }

  close() {
    this.db.close();
  }

  getProject() {
    this.ensureActiveProject();
    const row = this.db
      .prepare("SELECT project_json FROM projects WHERE id = ?")
      .get(ACTIVE_PROJECT_ID) as { project_json: string } | undefined;
    return expandProject(row ? JSON.parse(row.project_json) : {});
  }

  saveProject(projectInput: unknown, options: SaveProjectOptions = {}) {
    const current = this.getProject();
    const project = expandProject(projectInput);
    project.revision = current.revision + 1;
    const historyCommand =
      options.addHistory === false
        ? null
        : createProjectCommand(
            current,
            project,
            options.historyType || "project.change",
            options.historyParams || { source: "repository" },
            options.historySource || "sqlite",
          );
    this.transaction(() => {
      this.upsertProject(ACTIVE_PROJECT_ID, activeAssetOf(project).name, "active", true, project);
      this.replaceAssets(ACTIVE_PROJECT_ID, project);
      if (historyCommand) this.insertHistory(ACTIVE_PROJECT_ID, historyCommand);
    });
    return project;
  }

  addGalleryProject(input: GalleryProjectInput) {
    const project = expandProject(input.project);
    const projectId = input.id || uid();
    const projectName = input.name || project.godot.asset || "pixel_asset";
    const at = input.at || now();
    this.transaction(() => {
      this.upsertProject(projectId, projectName, "gallery", false, project, at);
      this.replaceAssets(projectId, project);
      if (input.thumbnailBase64)
        this.upsertThumbnail(projectId, input.thumbnailBase64, at);
    });
    return {
      id: projectId,
      name: projectName,
      at,
      project,
      thumbnail: input.thumbnailBase64 || null,
    };
  }

  listGallery() {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.created_at AS at, p.project_json, t.png_base64 AS thumbnail
         FROM projects p
         LEFT JOIN thumbnails t ON t.project_id = p.id
         WHERE p.kind = 'gallery'
         ORDER BY p.created_at DESC
         LIMIT 100`,
      )
      .all() as Array<{
      id: string;
      name: string;
      at: string;
      project_json: string;
      thumbnail?: string | null;
    }>;
    return rows.map((row) => {
      const project = expandProject(JSON.parse(row.project_json));
      return {
        id: row.id,
        name: row.name,
        at: row.at,
        asset: project.godot.asset,
        frames: project.frames.length,
        thumbnail: row.thumbnail || null,
      };
    });
  }

  getGalleryProject(id: string) {
    const row = this.db
      .prepare("SELECT project_json FROM projects WHERE id = ? AND kind = 'gallery'")
      .get(id) as { project_json: string } | undefined;
    return row ? expandProject(JSON.parse(row.project_json)) : null;
  }

  listHistory() {
    const rows = this.db
      .prepare(
        `SELECT id, at, command_type, label, source, params_json, patches_json,
                revision_before, revision_after
         FROM history
         WHERE project_id = ?
         ORDER BY at DESC
         LIMIT ?`,
      )
      .all(ACTIVE_PROJECT_ID, HISTORY_LIMIT) as any[];
    return rows
      .map((row) => this.historyFromRow(row))
      .filter(isHistoryCommand);
  }

  addPendingDiff(input: PendingDiffInput): PendingProjectDiff {
    this.ensureActiveProject();
    const current = this.getProject();
    const preview = previewProjectDiff(current, input.diff);
    const item = {
      id: input.id || uid(),
      at: input.diff.createdAt || now(),
      source: input.source || input.command?.source || "mcp",
      command: input.command || input.diff.command,
      diff: preview.diff,
      project: preview.project,
      summary: preview.summary,
    };
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_diffs
           (id, project_id, at, source, command_json, diff_json,
            preview_project_json, summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        ACTIVE_PROJECT_ID,
        item.at,
        item.source,
        JSON.stringify(item.command || {}),
        JSON.stringify(item.diff),
        JSON.stringify(compactProject(item.project)),
        JSON.stringify(item.summary),
      );
    return item;
  }

  listPendingDiffs(): PendingProjectDiff[] {
    this.ensureActiveProject();
    const rows = this.db
      .prepare(
        `SELECT id, at, source, command_json, diff_json, preview_project_json,
                summary_json
         FROM pending_diffs
         WHERE project_id = ?
         ORDER BY at DESC
         LIMIT 20`,
      )
      .all(ACTIVE_PROJECT_ID) as any[];
    return rows.map((row) => this.pendingDiffFromRow(row));
  }

  getPendingDiff(id: string): PendingProjectDiff | null {
    this.ensureActiveProject();
    const row = this.db
      .prepare(
        `SELECT id, at, source, command_json, diff_json, preview_project_json,
                summary_json
         FROM pending_diffs
         WHERE project_id = ? AND id = ?`,
      )
      .get(ACTIVE_PROJECT_ID, id) as any;
    return row ? this.pendingDiffFromRow(row) : null;
  }

  deletePendingDiff(id: string) {
    this.ensureActiveProject();
    const result = this.db
      .prepare("DELETE FROM pending_diffs WHERE project_id = ? AND id = ?")
      .run(ACTIVE_PROJECT_ID, id);
    return result.changes > 0;
  }

  upsertUser(input: UserInput) {
    const email = input.email || "local@pixel";
    const existing = this.db
      .prepare("SELECT id, email, name FROM users WHERE email = ?")
      .get(email) as any;
    if (existing) return existing;
    const user = {
      id: uid(),
      email,
      name: input.name || "Local User",
      created_at: now(),
    };
    this.db
      .prepare(
        "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(user.id, user.email, user.name, user.created_at);
    return { id: user.id, email: user.email, name: user.name };
  }

  recordExport(kind: string, filename: string, contentType: string, data: unknown) {
    this.ensureActiveProject();
    this.db
      .prepare(
        `INSERT INTO exports
           (id, project_id, kind, filename, content_type, data_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uid(),
        ACTIVE_PROJECT_ID,
        kind,
        filename,
        contentType,
        JSON.stringify(data),
        now(),
      );
  }

  exportJson() {
    return {
      project: compactProject(this.getProject()),
      gallery: this.listGallery(),
      history: this.listHistory(),
      exportedAt: now(),
    };
  }

  private applyMigrations() {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
    );
    const dir = migrationsDir();
    if (!fs.existsSync(dir)) return;
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const exists = this.db
        .prepare("SELECT version FROM schema_migrations WHERE version = ?")
        .get(version);
      if (exists) continue;
      this.transaction(() => {
        this.db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
        this.db
          .prepare(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          )
          .run(version, now());
      });
    }
  }

  private migrateLegacyJson() {
    const count = this.db
      .prepare("SELECT COUNT(*) AS total FROM projects")
      .get() as { total: number };
    if (count.total > 0) return;
    const legacyProject = readJson(this.options.legacyProjectPath, {});
    const legacyDb = readJson(this.options.legacyDbPath, {
      users: [],
      gallery: [],
      history: [],
    });
    const activeProject = expandProject(legacyProject);
    this.transaction(() => {
      this.upsertProject(
        ACTIVE_PROJECT_ID,
        activeAssetOf(activeProject).name,
        "active",
        true,
        activeProject,
      );
      this.replaceAssets(ACTIVE_PROJECT_ID, activeProject);
      for (const entry of Array.isArray(legacyDb.history)
        ? legacyDb.history.filter(isHistoryCommand).slice(0, HISTORY_LIMIT)
        : []) {
        this.insertHistory(ACTIVE_PROJECT_ID, entry);
      }
      for (const item of Array.isArray(legacyDb.gallery) ? legacyDb.gallery : []) {
        const galleryProject = expandProject(item.project);
        const galleryId = item.id || uid();
        const at = item.at || now();
        this.upsertProject(
          galleryId,
          item.name || galleryProject.godot.asset || "pixel_asset",
          "gallery",
          false,
          galleryProject,
          at,
        );
        this.replaceAssets(galleryId, galleryProject);
      }
      for (const user of Array.isArray(legacyDb.users) ? legacyDb.users : []) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO users (id, email, name, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            user.id || uid(),
            user.email || "local@pixel",
            user.name || "Local User",
            user.created_at || now(),
          );
      }
    });
  }

  private ensureActiveProject() {
    const row = this.db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(ACTIVE_PROJECT_ID);
    if (row) return;
    const project = expandProject({});
    this.transaction(() => {
      this.upsertProject(ACTIVE_PROJECT_ID, activeAssetOf(project).name, "active", true, project);
      this.replaceAssets(ACTIVE_PROJECT_ID, project);
    });
  }

  private upsertProject(
    id: string,
    name: string,
    kind: string,
    active: boolean,
    project: Project,
    createdAt = now(),
  ) {
    const at = now();
    this.db
      .prepare(
        `INSERT INTO projects
           (id, name, kind, active, revision, project_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           active = excluded.active,
           revision = excluded.revision,
           project_json = excluded.project_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        name,
        kind,
        active ? 1 : 0,
        project.revision,
        JSON.stringify(compactProject(project)),
        createdAt,
        at,
      );
  }

  private replaceAssets(projectId: string, project: Project) {
    this.db.prepare("DELETE FROM assets WHERE project_id = ?").run(projectId);
    const insert = this.db.prepare(
      `INSERT INTO assets
         (id, project_id, name, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const at = now();
    for (const asset of project.assets) {
      insert.run(
        `${projectId}:${asset.id}`,
        projectId,
        asset.name,
        JSON.stringify(asset),
        at,
        at,
      );
    }
  }

  private upsertThumbnail(projectId: string, pngBase64: string, at = now()) {
    this.db
      .prepare(
        `INSERT INTO thumbnails (project_id, png_base64, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           png_base64 = excluded.png_base64,
           updated_at = excluded.updated_at`,
      )
      .run(projectId, pngBase64, at);
  }

  private insertHistory(projectId: string, command: HistoryCommand) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO history
           (id, project_id, at, command_type, label, source, params_json,
            patches_json, revision_before, revision_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.id,
        projectId,
        command.at,
        command.command.type,
        command.command.label || null,
        command.command.source || null,
        JSON.stringify(command.command.params || {}),
        JSON.stringify(command.patches),
        command.revisionBefore ?? null,
        command.revisionAfter ?? null,
      );
  }

  private historyFromRow(row: any): HistoryCommand {
    return {
      id: row.id,
      at: row.at,
      command: {
        type: row.command_type,
        label: row.label || undefined,
        source: row.source || undefined,
        params: row.params_json ? JSON.parse(row.params_json) : undefined,
      },
      revisionBefore: row.revision_before ?? undefined,
      revisionAfter: row.revision_after ?? undefined,
      patches: row.patches_json ? JSON.parse(row.patches_json) : [],
    };
  }

  private pendingDiffFromRow(row: any): PendingProjectDiff {
    return {
      id: row.id,
      at: row.at,
      source: row.source,
      command: row.command_json ? JSON.parse(row.command_json) : undefined,
      diff: JSON.parse(row.diff_json),
      project: expandProject(JSON.parse(row.preview_project_json)),
      summary: row.summary_json
        ? JSON.parse(row.summary_json)
        : previewProjectDiff(this.getProject(), JSON.parse(row.diff_json)).summary,
    };
  }

  private transaction<T>(fn: () => T) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
