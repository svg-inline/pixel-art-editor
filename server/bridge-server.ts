import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { z } from "zod";
import { loadLocalEnv } from "./load-env.ts";
import {
  activeFrameOf,
  activeAssetOf,
  atlasMetadata,
  compactProject,
  compositeFrameRgba,
  createVariation,
  editSelection,
  expandProject,
  extendAnimation,
  godotMetadata,
  limitColors,
  qualityReport,
  replaceGlobalColor,
  SIZE,
  slug,
  unityMetadata,
  type Project,
} from "../shared/pixel-core.ts";
import {
  createProjectCommand,
  HISTORY_LIMIT,
  isHistoryCommand,
  type HistoryCommand,
} from "../shared/history.ts";
import { createAiProvider, type AiOperation } from "./ai/provider.ts";
import { encodePngRgba } from "./png.ts";
import {
  defaultDbPath,
  defaultProjectPath,
  migrateRuntimeFiles,
  writeInitialRuntimeFiles,
} from "./runtime-files.ts";
import {
  assertBridgeSecurity,
  bridgeSecurityConfig,
  corsHeaders,
  isOriginAllowed,
  isTokenValid,
  requestOrigin,
} from "./bridge-security.ts";

loadLocalEnv();

const PORT = Number(process.env.PIXEL_BRIDGE_PORT || 8787);
const HOST = process.env.PIXEL_BRIDGE_HOST || "127.0.0.1";
const PROJECT_PATH = path.resolve(
  process.env.PIXEL_PROJECT_PATH || defaultProjectPath(),
);
const DB_PATH = path.resolve(process.env.PIXEL_DB_PATH || defaultDbPath());
const BODY_LIMIT = Number(
  process.env.PIXEL_BRIDGE_BODY_LIMIT || 64 * 1024 * 1024,
);
const SECURITY = bridgeSecurityConfig();
const aiProvider = createAiProvider();

assertBridgeSecurity(SECURITY);
migrateRuntimeFiles(PROJECT_PATH, DB_PATH);
writeInitialRuntimeFiles(PROJECT_PATH, DB_PATH);

type Db = { users: any[]; gallery: any[]; history: HistoryCommand[] };
class RevisionConflictError extends Error {
  status = 409;
  current: Project;

  constructor(expected: number, current: Project) {
    super(`revision_conflict_expected_${expected}_current_${current.revision}`);
    this.current = current;
  }
}
type WriteProjectOptions = {
  addHistory?: boolean;
  expectedRevision?: number | null;
};
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const SelectionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .nullable()
  .optional();
const AiOperationSchema = z.enum([
  "generate",
  "edit",
  "edit_selection",
  "replace_subject",
  "create_variation",
  "recolor_palette",
  "extend_animation",
]);
const ProjectPostSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    source: z.string().optional(),
    addHistory: z.boolean().optional(),
  })
  .passthrough();
const AiPromptSchema = z
  .object({
    prompt: z.string().default(""),
    operation: AiOperationSchema.optional(),
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    selection: SelectionSchema,
    layer: z.string().optional(),
    from: HexColorSchema.optional(),
    to: HexColorSchema.optional(),
    maxColors: z.number().int().min(2).max(256).optional(),
  })
  .passthrough();
const EditSelectionSchema = z
  .object({
    prompt: z.string().default(""),
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    selection: SelectionSchema,
    layer: z.string().optional(),
  })
  .passthrough();
const RecolorSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    from: HexColorSchema,
    to: HexColorSchema,
  })
  .passthrough();
const LimitColorsSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    maxColors: z.number().int().min(2).max(256).default(32),
  })
  .passthrough();
const VariationSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    variant: z.string().optional(),
    prompt: z.string().optional(),
  })
  .passthrough();
const ExtendAnimationSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    totalFrames: z.number().int().min(1).max(64).default(8),
  })
  .passthrough();
const SetActiveAssetSchema = z.object({ asset: z.string() }).passthrough();
const LoginSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().optional(),
  })
  .passthrough();
const GalleryPostSchema = z
  .object({
    name: z.string().optional(),
    project: z.any().optional(),
  })
  .passthrough();
const id = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
let writeQueue = Promise.resolve();
let lastMtime = 0;
const clients = new Set<http.ServerResponse>();

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
function atomicWrite(filePath: string, data: string | Buffer) {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}
function readJsonFile(filePath: string, fallback: any) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  return text.trim() ? JSON.parse(text) : fallback;
}
function readProject(): Project {
  if (!fs.existsSync(PROJECT_PATH)) {
    const project = expandProject({});
    atomicWrite(PROJECT_PATH, JSON.stringify(compactProject(project), null, 2));
    return project;
  }
  return expandProject(readJsonFile(PROJECT_PATH, {}));
}
function readDb(): Db {
  const db = readJsonFile(DB_PATH, { users: [], gallery: [], history: [] });
  return {
    users: Array.isArray(db.users) ? db.users : [],
    gallery: Array.isArray(db.gallery) ? db.gallery : [],
    history: Array.isArray(db.history)
      ? db.history.filter(isHistoryCommand).slice(0, HISTORY_LIMIT)
      : [],
  };
}
function writeDb(db: Db) {
  atomicWrite(DB_PATH, JSON.stringify(db, null, 2));
}
function migrateDbHistory() {
  const raw = readJsonFile(DB_PATH, { users: [], gallery: [], history: [] });
  const db = readDb();
  if (
    !Array.isArray(raw.history) ||
    raw.history.length !== db.history.length ||
    raw.history.some((entry: any) => !isHistoryCommand(entry))
  )
    writeDb(db);
}
function expectedRevisionFrom(data: any): number | null {
  const value = data?.revision ?? data?.project?.revision;
  const revision = Number(value);
  return Number.isFinite(revision) ? Math.max(0, Math.floor(revision)) : null;
}
async function writeProject(
  projectInput: any,
  options: WriteProjectOptions = {},
) {
  const addHistory = options.addHistory !== false;
  let savedProject: Project | null = null;
  const writeTask = writeQueue.then(() => {
    const current = readProject();
    if (
      options.expectedRevision !== null &&
      options.expectedRevision !== undefined &&
      current.revision !== options.expectedRevision
    ) {
      throw new RevisionConflictError(options.expectedRevision, current);
    }
    const project = expandProject(projectInput);
    project.revision = current.revision + 1;
    atomicWrite(PROJECT_PATH, JSON.stringify(compactProject(project), null, 2));
    if (addHistory) {
      const db = readDb();
      const historyCommand = createProjectCommand(
        current,
        project,
        "project.change",
        { source: "bridge" },
        "bridge",
      );
      if (historyCommand) {
        db.history.unshift(historyCommand);
        db.history = db.history.slice(0, HISTORY_LIMIT);
        writeDb(db);
      }
    }
    lastMtime = fs.existsSync(PROJECT_PATH)
      ? fs.statSync(PROJECT_PATH).mtimeMs
      : lastMtime;
    broadcastProject(project);
    savedProject = project;
  });
  writeQueue = writeTask.then(
    () => undefined,
    () => undefined,
  );
  await writeTask;
  return savedProject as Project;
}
function sendEvent(res: http.ServerResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcastProject(project = readProject()) {
  const expanded = expandProject(project);
  for (const res of clients) sendEvent(res, "project", expanded);
}
function json(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  data: any,
) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(req, SECURITY),
  });
  res.end(JSON.stringify(data));
}
function png(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  buffer: Buffer,
  filename = "preview.png",
) {
  res.writeHead(200, {
    "content-type": "image/png",
    "content-disposition": `inline; filename="${filename}"`,
    ...corsHeaders(req, SECURITY),
  });
  res.end(buffer);
}
async function body(req: http.IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error(`body_too_large_${BODY_LIMIT}`));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("invalid_json_body"));
      }
    });
    req.on("error", reject);
  });
}
function parseBody<T>(input: unknown, schema: z.ZodType<T>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new Error(`invalid_payload_${issues}`);
  }
  return result.data;
}
function renderProjectPng(project: Project, frameIndex = 0) {
  const frame =
    project.frames[
      Math.max(0, Math.min(project.frames.length - 1, frameIndex))
    ] || activeFrameOf(project);
  return encodePngRgba(
    SIZE,
    SIZE,
    compositeFrameRgba(frame, project.background),
  );
}
function renderSpritesheetPng(project: Project) {
  const width = SIZE * project.frames.length;
  const height = SIZE;
  const sheet = new Uint8Array(width * height * 4);
  project.frames.forEach((frame, fi) => {
    const rgba = compositeFrameRgba(frame, project.background);
    for (let y = 0; y < SIZE; y++) {
      const sourceOffset = y * SIZE * 4;
      const targetOffset = (y * width + fi * SIZE) * 4;
      sheet.set(
        rgba.subarray(sourceOffset, sourceOffset + SIZE * 4),
        targetOffset,
      );
    }
  });
  return encodePngRgba(width, height, sheet);
}
function renderGodotAssetSpritesheetPng(project: Project) {
  const asset = activeAssetOf(project);
  const width = SIZE * Math.max(
    1,
    ...asset.animations.map((animation) => animation.frames.length),
  );
  const height = SIZE * Math.max(1, asset.animations.length);
  const sheet = new Uint8Array(width * height * 4);
  asset.animations.forEach((animation, row) => {
    animation.frames.forEach((frame, frameIndex) => {
      const rgba = compositeFrameRgba(frame, project.background);
      for (let y = 0; y < SIZE; y++) {
        const sourceOffset = y * SIZE * 4;
        const targetOffset = ((row * SIZE + y) * width + frameIndex * SIZE) * 4;
        sheet.set(
          rgba.subarray(sourceOffset, sourceOffset + SIZE * 4),
          targetOffset,
        );
      }
    });
  });
  return encodePngRgba(width, height, sheet);
}

fs.watchFile(PROJECT_PATH, { interval: 500 }, () => {
  try {
    if (!fs.existsSync(PROJECT_PATH)) return;
    const stat = fs.statSync(PROJECT_PATH);
    if (stat.mtimeMs !== lastMtime) {
      lastMtime = stat.mtimeMs;
      broadcastProject(readProject());
    }
  } catch {}
});

migrateDbHistory();

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  if (!isOriginAllowed(requestOrigin(req), SECURITY))
    return json(req, res, 403, { error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return json(req, res, 204, { ok: true });
  if (!isTokenValid(req, SECURITY, url.searchParams))
    return json(req, res, 401, { error: "unauthorized" });
  try {
    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        ...corsHeaders(req, SECURITY),
      });
      clients.add(res);
      sendEvent(res, "project", readProject());
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/api/project" && req.method === "GET")
      return json(req, res, 200, readProject());
    if (url.pathname === "/api/project.compact" && req.method === "GET")
      return json(req, res, 200, compactProject(readProject()));
    if (url.pathname === "/api/assets" && req.method === "GET") {
      const project = readProject();
      return json(
        req,
        res,
        200,
        project.assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          active: asset.id === project.activeAssetId,
          animations: asset.animations.map((animation) => ({
            id: animation.id,
            name: animation.name,
            direction: animation.direction,
            fps: animation.fps,
            loop: animation.loop,
            frames: animation.frames.length,
          })),
        })),
      );
    }
    if (url.pathname === "/api/project" && req.method === "POST") {
      const data = parseBody(await body(req), ProjectPostSchema);
      const projectInput = data?.project || data;
      return json(
        req,
        res,
        200,
        await writeProject(projectInput, {
          addHistory: data?.addHistory !== false && data?.source !== "autosave",
          expectedRevision: expectedRevisionFrom(data),
        }),
      );
    }

    if (url.pathname === "/api/ai-prompt" && req.method === "POST") {
      const data = parseBody(await body(req), AiPromptSchema);
      const project = await aiProvider.run({
        prompt: data.prompt,
        operation: (data.operation || "generate") as AiOperation,
        project: data.project || readProject(),
        selection: data.selection || null,
        layer: data.layer,
        from: data.from,
        to: data.to,
        maxColors: data.maxColors,
      });
      return json(
        req,
        res,
        200,
        await writeProject(project, {
          expectedRevision: expectedRevisionFrom(data),
        }),
      );
    }
    if (url.pathname === "/api/tools/edit-selection" && req.method === "POST") {
      const data = parseBody(await body(req), EditSelectionSchema);
      return json(
        req,
        res,
        200,
        await writeProject(
          editSelection(
            data.project || readProject(),
            data.prompt || "",
            data.selection || null,
            data.layer,
          ),
          { expectedRevision: expectedRevisionFrom(data) },
        ),
      );
    }
    if (
      url.pathname === "/api/tools/recolor-palette" &&
      req.method === "POST"
    ) {
      const data = parseBody(await body(req), RecolorSchema);
      return json(
        req,
        res,
        200,
        await writeProject(
          replaceGlobalColor(
            expandProject(data.project || readProject()),
            data.from,
            data.to,
          ),
          { expectedRevision: expectedRevisionFrom(data) },
        ),
      );
    }
    if (url.pathname === "/api/tools/limit-colors" && req.method === "POST") {
      const data = parseBody(await body(req), LimitColorsSchema);
      return json(
        req,
        res,
        200,
        await writeProject(
          limitColors(
            expandProject(data.project || readProject()),
            data.maxColors,
          ),
          { expectedRevision: expectedRevisionFrom(data) },
        ),
      );
    }
    if (
      url.pathname === "/api/tools/create-variation" &&
      req.method === "POST"
    ) {
      const data = parseBody(await body(req), VariationSchema);
      return json(
        req,
        res,
        200,
        await writeProject(
          createVariation(
            data.project || readProject(),
            data.variant || data.prompt || "mirror_h",
          ),
          { expectedRevision: expectedRevisionFrom(data) },
        ),
      );
    }
    if (
      url.pathname === "/api/tools/extend-animation" &&
      req.method === "POST"
    ) {
      const data = parseBody(await body(req), ExtendAnimationSchema);
      return json(
        req,
        res,
        200,
        await writeProject(
          extendAnimation(
            data.project || readProject(),
            data.totalFrames,
          ),
          { expectedRevision: expectedRevisionFrom(data) },
        ),
      );
    }
    if (
      url.pathname === "/api/tools/set-active-asset" &&
      req.method === "POST"
    ) {
      const data = parseBody(await body(req), SetActiveAssetSchema);
      const project = readProject();
      const asset = project.assets.find(
        (item) => item.id === data.asset || item.name === data.asset,
      );
      if (!asset) return json(req, res, 404, { error: "asset_not_found" });
      project.activeAssetId = asset.id;
      project.activeAnimationId = asset.animations[0].id;
      project.activeFrameId = asset.animations[0].frames[0]?.id || "";
      return json(
        req,
        res,
        200,
        await writeProject(project, { expectedRevision: project.revision }),
      );
    }
    if (url.pathname === "/api/quality" && req.method === "GET")
      return json(
        req,
        res,
        200,
        qualityReport(
          readProject(),
          Number(url.searchParams.get("maxColors") || 32),
        ),
      );
    if (url.pathname === "/api/preview.png" && req.method === "GET")
      return png(
        req,
        res,
        renderProjectPng(
          readProject(),
          Number(url.searchParams.get("frame") || 0),
        ),
      );
    if (url.pathname === "/api/spritesheet.png" && req.method === "GET") {
      const project = readProject();
      const asset = slug(project.godot.asset),
        anim = slug(project.godot.animation);
      return png(
        req,
        res,
        renderSpritesheetPng(project),
        `${asset}_${anim}_sheet.png`,
      );
    }
    if (url.pathname === "/api/godot/spritesheet.png" && req.method === "GET") {
      const project = readProject();
      const asset = slug(project.godot.asset);
      return png(
        req,
        res,
        renderGodotAssetSpritesheetPng(project),
        `${asset}_sheet.png`,
      );
    }
    if (url.pathname === "/api/export/godot" && req.method === "GET")
      return json(req, res, 200, godotMetadata(readProject()));
    if (url.pathname === "/api/export/atlas" && req.method === "GET")
      return json(req, res, 200, atlasMetadata(readProject()));
    if (url.pathname === "/api/export/unity" && req.method === "GET")
      return json(req, res, 200, unityMetadata(readProject()));

    if (url.pathname === "/api/login" && req.method === "POST") {
      const data = parseBody(await body(req), LoginSchema);
      const db = readDb();
      let user = db.users.find((u: any) => u.email === data.email);
      if (!user) {
        user = {
          id: id(),
          email: data.email || "local@pixel",
          name: data.name || "Local User",
        };
        db.users.push(user);
        writeDb(db);
      }
      return json(req, res, 200, { ok: true, user, token: user.id });
    }
    if (url.pathname === "/api/gallery" && req.method === "GET") {
      const db = readDb();
      return json(
        req,
        res,
        200,
        db.gallery.map((g: any) => ({
          id: g.id,
          name: g.name,
          at: g.at,
          asset: expandProject(g.project).godot.asset,
          frames: expandProject(g.project).frames.length,
        })),
      );
    }
    if (url.pathname === "/api/gallery" && req.method === "POST") {
      const data = parseBody(await body(req), GalleryPostSchema);
      const project = expandProject(data.project || readProject());
      const db = readDb();
      const item = {
        id: id(),
        name: data.name || project.godot.asset || "pixel_asset",
        at: new Date().toISOString(),
        project: compactProject(project),
      };
      db.gallery.unshift(item);
      db.gallery = db.gallery.slice(0, 100);
      writeDb(db);
      return json(req, res, 200, { ...item, project });
    }
    if (url.pathname.startsWith("/api/gallery/") && req.method === "GET") {
      const db = readDb();
      const item = db.gallery.find(
        (g: any) => g.id === url.pathname.split("/").pop(),
      );
      return item
        ? json(req, res, 200, expandProject(item.project))
        : json(req, res, 404, { error: "not_found" });
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      const db = readDb();
      return json(
        req,
        res,
        200,
        db.history.map((h) => ({
          id: h.id,
          at: h.at,
          command: h.command.type,
          label: h.command.label,
          patches: h.patches.length,
          pixelChanges: h.patches.reduce(
            (sum, patch) =>
              patch.type === "pixels.changed"
                ? sum + patch.changes.length
                : sum,
            0,
          ),
        })),
      );
    }
    return json(req, res, 404, { error: "not_found" });
  } catch (e: any) {
    if (e instanceof RevisionConflictError)
      return json(req, res, 409, {
        error: "revision_conflict",
        current: e.current,
        revision: e.current.revision,
      });
    return json(req, res, 500, { error: e?.message || "server_error" });
  }
});

server.listen(PORT, HOST, () => {
  console.error(
    `[pixel-bridge] http://${HOST}:${PORT} project=${PROJECT_PATH} ai=${aiProvider.name}`,
  );
});
