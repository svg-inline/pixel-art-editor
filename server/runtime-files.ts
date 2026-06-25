import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { compactProject, expandProject } from "../shared/pixel-core.ts";

export const RUNTIME_DIR = path.resolve(
  process.env.PIXEL_RUNTIME_DIR || "./runtime",
);
export const PROJECT_FILE = "pixel-project.mcp.json";
export const DB_FILE = "pixel-art-db.json";
export const SQLITE_FILE = "editor.sqlite";

type RuntimeFile = {
  name: string;
  legacyPath: string;
  targetPath: string;
};

export function runtimePath(fileName: string) {
  return path.join(RUNTIME_DIR, fileName);
}

export function defaultProjectPath() {
  return runtimePath(PROJECT_FILE);
}

export function defaultDbPath() {
  return runtimePath(DB_FILE);
}

export function defaultSqlitePath() {
  return runtimePath(SQLITE_FILE);
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupPath(filePath: string, reason: string) {
  const parsed = path.parse(filePath);
  return path.join(
    RUNTIME_DIR,
    "backups",
    `${timestamp()}-${reason}-${parsed.base}`,
  );
}

export function backupRuntimeFile(filePath: string, reason = "backup") {
  if (!fs.existsSync(filePath)) return null;
  const target = backupPath(filePath, reason);
  ensureDir(target);
  fs.copyFileSync(filePath, target);
  return target;
}

function runtimeFiles(projectPath: string, dbPath: string): RuntimeFile[] {
  return [
    {
      name: PROJECT_FILE,
      legacyPath: path.resolve(PROJECT_FILE),
      targetPath: path.resolve(projectPath),
    },
    {
      name: DB_FILE,
      legacyPath: path.resolve(DB_FILE),
      targetPath: path.resolve(dbPath),
    },
  ];
}

export function migrateRuntimeFiles(projectPath: string, dbPath: string) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  for (const file of runtimeFiles(projectPath, dbPath)) {
    if (file.legacyPath === file.targetPath || !fs.existsSync(file.legacyPath))
      continue;
    const backup = backupRuntimeFile(file.legacyPath, "legacy");
    ensureDir(file.targetPath);
    if (!fs.existsSync(file.targetPath)) {
      fs.renameSync(file.legacyPath, file.targetPath);
    } else {
      const archivedLegacy = path.join(
        RUNTIME_DIR,
        "backups",
        `${timestamp()}-archived-${file.name}`,
      );
      ensureDir(archivedLegacy);
      fs.renameSync(file.legacyPath, archivedLegacy);
    }
    if (!backup) throw new Error(`runtime_backup_failed_${file.name}`);
  }
}

export function writeInitialRuntimeFiles(projectPath: string, dbPath: string) {
  ensureDir(projectPath);
  ensureDir(dbPath);
  if (!fs.existsSync(projectPath)) {
    fs.writeFileSync(
      projectPath,
      JSON.stringify(compactProject(expandProject({})), null, 2),
    );
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ users: [], gallery: [], history: [] }, null, 2),
    );
  }
}

export function resetRuntimeFiles(projectPath: string, dbPath: string) {
  backupRuntimeFile(projectPath, "reset");
  backupRuntimeFile(dbPath, "reset");
  fs.rmSync(projectPath, { force: true });
  fs.rmSync(dbPath, { force: true });
  writeInitialRuntimeFiles(projectPath, dbPath);
}
