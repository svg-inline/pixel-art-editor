import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  defaultDbPath,
  defaultProjectPath,
  defaultSqlitePath,
  backupRuntimeFile,
  migrateRuntimeFiles,
  resetRuntimeFiles,
  RUNTIME_DIR,
  writeInitialRuntimeFiles,
} from "./runtime-files.ts";
import { ProjectRepository } from "./db.ts";

const command = process.argv[2] || "status";
const projectPath = path.resolve(
  process.env.PIXEL_PROJECT_PATH || defaultProjectPath(),
);
const dbPath = path.resolve(process.env.PIXEL_DB_PATH || defaultDbPath());
const sqlitePath = path.resolve(
  process.env.PIXEL_SQLITE_PATH || defaultSqlitePath(),
);

function printStatus() {
  const files = [
    ["runtime", RUNTIME_DIR],
    ["project", projectPath],
    ["legacy db", dbPath],
    ["sqlite", sqlitePath],
    ["legacy project", path.resolve("pixel-project.mcp.json")],
    ["legacy root db", path.resolve("pixel-art-db.json")],
  ] as const;
  for (const [label, filePath] of files) {
    const exists = fs.existsSync(filePath);
    const size = exists && fs.statSync(filePath).isFile()
      ? `${fs.statSync(filePath).size} bytes`
      : exists
        ? "dir"
        : "missing";
    console.log(`${label}: ${filePath} (${size})`);
  }
}

if (command === "migrate") {
  migrateRuntimeFiles(projectPath, dbPath);
  writeInitialRuntimeFiles(projectPath, dbPath);
  new ProjectRepository(sqlitePath, {
    legacyProjectPath: projectPath,
    legacyDbPath: dbPath,
  }).close();
  printStatus();
} else if (command === "reset") {
  resetRuntimeFiles(projectPath, dbPath);
  backupRuntimeFile(sqlitePath, "reset");
  fs.rmSync(sqlitePath, { force: true });
  fs.rmSync(`${sqlitePath}-wal`, { force: true });
  fs.rmSync(`${sqlitePath}-shm`, { force: true });
  new ProjectRepository(sqlitePath).close();
  printStatus();
} else if (command === "status") {
  printStatus();
} else {
  console.error("Usage: npm run runtime:status|runtime:migrate|runtime:reset");
  process.exitCode = 1;
}
