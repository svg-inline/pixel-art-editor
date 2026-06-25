#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const rootDir = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const outputDir = path.join(rootDir, "release");
const outputName = `${packageJson.name}-${packageJson.version}.zip`;
const outputPath = path.join(outputDir, outputName);

const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
]);

const excludedRootFiles = new Set([
  ".env",
  "pixel-project.mcp.json",
  "pixel-art-db.json",
]);

const excludedLockfiles = new Set([
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

const excludedSuffixes = [
  ".zip",
  ".sqlite",
  ".sqlite-wal",
  ".sqlite-shm",
  ".db",
  ".db-wal",
  ".db-shm",
  ".tmp",
  ".temp",
  ".log",
  ".bak",
  ".swp",
];

const runtimeKeepFiles = new Set([
  "runtime/.gitkeep",
  "runtime/README.md",
]);

const forbiddenZipEntries = [
  ".git/",
  "node_modules/",
  "dist/",
  "release/",
  "runtime/backups/",
  "runtime/exports/",
];

const crcTable = makeCrcTable();

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldSkipFile(relativePath) {
  const normalized = normalize(relativePath);
  const basename = path.basename(relativePath);
  const lower = normalized.toLowerCase();

  if (runtimeKeepFiles.has(normalized)) {
    return false;
  }

  if (normalized.startsWith("runtime/")) {
    return true;
  }

  if (excludedRootFiles.has(normalized) || excludedLockfiles.has(basename)) {
    return true;
  }

  return excludedSuffixes.some((suffix) => lower.endsWith(suffix));
}

function collectFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    const normalized = normalize(relativePath);

    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) {
        continue;
      }

      if (normalized === "runtime/backups" || normalized === "runtime/exports") {
        continue;
      }

      files.push(...collectFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && !shouldSkipFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }

  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    const data = readFileSync(absolutePath);
    const compressed = deflateRawSync(data, { level: 9 });
    const entryName = normalize(relativePath);
    const entryNameBuffer = Buffer.from(entryName);
    const modified = statSync(absolutePath).mtime;
    const { dosDate, dosTime } = dosDateTime(modified);
    const crc = crc32(data);

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(data.length),
      uint16(entryNameBuffer.length),
      uint16(0),
      entryNameBuffer,
    ]);

    chunks.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(data.length),
      uint16(entryNameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      entryNameBuffer,
    ]);

    centralDirectory.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralDirectory);
  const endRecord = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralBuffer.length),
    uint32(centralOffset),
    uint16(0),
  ]);

  return Buffer.concat([...chunks, centralBuffer, endRecord]);
}

function assertCleanEntries(files) {
  const forbiddenEntries = files.filter((file) => (
    forbiddenZipEntries.some((entry) => file.startsWith(entry)) ||
    shouldSkipFile(file)
  ));

  if (forbiddenEntries.length > 0) {
    throw new Error(`Clean package would include forbidden entries:\n${forbiddenEntries.join("\n")}`);
  }
}

const files = collectFiles(rootDir).map(normalize).sort();
assertCleanEntries(files);

mkdirSync(outputDir, { recursive: true });
rmSync(outputPath, { force: true });
writeFileSync(outputPath, createZip(files));

console.log(`Created ${path.relative(rootDir, outputPath)} with ${files.length} files.`);
