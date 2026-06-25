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
  colorsUsed,
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
  type HistoryCommandName,
} from "../shared/history.ts";
import {
  applyProjectDiff,
  createProjectDiff,
  previewProjectDiff,
} from "../shared/diff.ts";
import {
  ProjectDiffSchema,
  type ProjectDiff,
} from "../shared/schema.ts";
import {
  AiOperationSchema,
  createAiProvider,
  type AiOperation,
  type AiProviderResult,
} from "./ai/provider.ts";
import { encodePngRgba } from "./png.ts";
import {
  defaultDbPath,
  defaultProjectPath,
  defaultSqlitePath,
  migrateRuntimeFiles,
} from "./runtime-files.ts";
import { ProjectRepository } from "./db.ts";
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
const LEGACY_DB_PATH = path.resolve(
  process.env.PIXEL_DB_PATH || defaultDbPath(),
);
const SQLITE_PATH = path.resolve(
  process.env.PIXEL_SQLITE_PATH || defaultSqlitePath(),
);
const BODY_LIMIT = Number(
  process.env.PIXEL_BRIDGE_BODY_LIMIT || 64 * 1024 * 1024,
);
const SECURITY = bridgeSecurityConfig();
const aiProvider = createAiProvider();

assertBridgeSecurity(SECURITY);
migrateRuntimeFiles(PROJECT_PATH, LEGACY_DB_PATH);
const repository = new ProjectRepository(SQLITE_PATH, {
  legacyProjectPath: PROJECT_PATH,
  legacyDbPath: LEGACY_DB_PATH,
});

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
  historyType?: HistoryCommandName;
  historyParams?: Record<string, unknown>;
  historySource?: string;
};
type AiPreview = {
  id: string;
  at: string;
  baseRevision: number;
  prompt: string;
  operation: AiOperation;
  provider: string;
  providerKind: "local" | "http";
  model?: string;
  diff: ProjectDiff;
  project: ReturnType<typeof compactProject>;
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
const ProjectPostSchema = z
  .object({
    project: z.any().optional(),
    revision: z.number().int().nonnegative().optional(),
    source: z.string().optional(),
    addHistory: z.boolean().optional(),
  })
  .passthrough();
const DiffPreviewPostSchema = z
  .object({
    diff: ProjectDiffSchema,
    source: z.string().optional(),
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
const aiPreviews = new Map<string, AiPreview>();

function readProject(): Project {
  return repository.getProject();
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
    savedProject = repository.saveProject(project, {
      addHistory,
      historyType: options.historyType,
      historyParams: options.historyParams,
      historySource: options.historySource || "bridge",
    });
    lastMtime = fs.existsSync(SQLITE_PATH)
      ? fs.statSync(SQLITE_PATH).mtimeMs
      : lastMtime;
    broadcastProject(savedProject);
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
function aiHistoryParams(
  result: AiProviderResult,
  data: { prompt?: string; operation?: AiOperation },
) {
  return {
    operation: data.operation || "generate",
    prompt: data.prompt || "",
    provider: result.provider,
    providerKind: result.providerKind,
    model: result.model,
  };
}
async function runAiPrompt(data: z.infer<typeof AiPromptSchema>) {
  const project = expandProject(data.project || readProject());
  return aiProvider.generate({
    prompt: data.prompt,
    operation: (data.operation || "generate") as AiOperation,
    project,
    selection: data.selection || null,
    layer: data.layer,
    from: data.from,
    to: data.to,
    maxColors: data.maxColors,
    palette: project.palette.length
      ? project.palette
      : colorsUsed(project).map(([color]) => color),
  });
}

function watchRepositoryFile(filePath: string) {
  fs.watchFile(filePath, { interval: 500 }, () => {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs !== lastMtime) {
        lastMtime = stat.mtimeMs;
        broadcastProject(readProject());
      }
    } catch {}
  });
}

watchRepositoryFile(SQLITE_PATH);
watchRepositoryFile(`${SQLITE_PATH}-wal`);

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
      const result = await runAiPrompt(data);
      return json(
        req,
        res,
        200,
        await writeProject(result.project, {
          expectedRevision: expectedRevisionFrom(data),
          historyParams: aiHistoryParams(result, {
            prompt: data.prompt,
            operation: (data.operation || "generate") as AiOperation,
          }),
        }),
      );
    }
    if (url.pathname === "/api/ai-preview" && req.method === "POST") {
      const data = parseBody(await body(req), AiPromptSchema);
      const baseProject = expandProject(data.project || readProject());
      const result = await runAiPrompt(data);
      const diff = createProjectDiff(baseProject, result.project, {
        source: "bridge",
        tool: "ai-preview",
        prompt: data.prompt,
        params: aiHistoryParams(result, {
          prompt: data.prompt,
          operation: (data.operation || "generate") as AiOperation,
        }),
      });
      if (!diff) return json(req, res, 400, { error: "empty_diff" });
      const diffPreview = previewProjectDiff(baseProject, diff);
      const aiPreview: AiPreview = {
        id: id(),
        at: new Date().toISOString(),
        baseRevision: expectedRevisionFrom(data) ?? readProject().revision,
        prompt: data.prompt,
        operation: (data.operation || "generate") as AiOperation,
        provider: result.provider,
        providerKind: result.providerKind,
        model: result.model,
        diff,
        project: compactProject(diffPreview.project),
      };
      aiPreviews.set(aiPreview.id, aiPreview);
      return json(req, res, 200, {
        ...aiPreview,
        project: diffPreview.project,
        summary: diffPreview.summary,
      });
    }
    if (
      url.pathname.startsWith("/api/ai-preview/") &&
      url.pathname.endsWith("/accept") &&
      req.method === "POST"
    ) {
      const previewId = url.pathname.split("/").at(-2) || "";
      const preview = aiPreviews.get(previewId);
      if (!preview)
        return json(req, res, 404, { error: "ai_preview_not_found" });
      const data = parseBody(await body(req), ProjectPostSchema);
      const current = readProject();
      const saved = await writeProject(applyProjectDiff(current, preview.diff), {
        expectedRevision: expectedRevisionFrom(data) ?? preview.baseRevision,
        historyType: "mcp.diff",
        historyParams: {
          tool: "ai-preview",
          operation: preview.operation,
          prompt: preview.prompt,
          provider: preview.provider,
          providerKind: preview.providerKind,
          model: preview.model,
          previewId: preview.id,
          timestamp: preview.at,
          diff: preview.diff,
        },
        historySource: "bridge",
      });
      aiPreviews.delete(preview.id);
      return json(req, res, 200, saved);
    }
    if (
      url.pathname.startsWith("/api/ai-preview/") &&
      req.method === "DELETE"
    ) {
      const previewId = url.pathname.split("/").pop() || "";
      const existed = aiPreviews.delete(previewId);
      return json(req, res, existed ? 200 : 404, { ok: existed });
    }
    if (url.pathname === "/api/diff-preview" && req.method === "POST") {
      const data = parseBody(await body(req), DiffPreviewPostSchema);
      const pending = repository.addPendingDiff({
        diff: data.diff,
        source: data.source || data.diff.command?.source || "bridge",
        command: data.diff.command,
      });
      return json(req, res, 200, pending);
    }
    if (url.pathname === "/api/mcp-previews" && req.method === "GET") {
      return json(req, res, 200, repository.listPendingDiffs());
    }
    if (
      url.pathname.startsWith("/api/mcp-preview/") &&
      url.pathname.endsWith("/accept") &&
      req.method === "POST"
    ) {
      const previewId = url.pathname.split("/").at(-2) || "";
      const pending = repository.getPendingDiff(previewId);
      if (!pending)
        return json(req, res, 404, { error: "mcp_preview_not_found" });
      const data = parseBody(await body(req), ProjectPostSchema);
      const current = readProject();
      const saved = await writeProject(applyProjectDiff(current, pending.diff), {
        expectedRevision: expectedRevisionFrom(data) ?? pending.diff.baseRevision,
        historyType: "mcp.diff",
        historyParams: {
          ...(pending.command?.params || {}),
          tool: pending.command?.tool || "mcp",
          prompt: pending.command?.prompt,
          timestamp: pending.command?.timestamp || pending.at,
          previewId: pending.id,
          diff: pending.diff,
          summary: pending.summary,
        },
        historySource: pending.source || "mcp",
      });
      repository.deletePendingDiff(previewId);
      return json(req, res, 200, saved);
    }
    if (
      url.pathname.startsWith("/api/mcp-preview/") &&
      req.method === "DELETE"
    ) {
      const previewId = url.pathname.split("/").pop() || "";
      const existed = repository.deletePendingDiff(previewId);
      return json(req, res, existed ? 200 : 404, { ok: existed });
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
    if (url.pathname === "/api/export/godot" && req.method === "GET") {
      const data = godotMetadata(readProject());
      repository.recordExport("godot", "godot.animations.json", "application/json", data);
      return json(req, res, 200, data);
    }
    if (url.pathname === "/api/export/atlas" && req.method === "GET") {
      const data = atlasMetadata(readProject());
      repository.recordExport("atlas", "atlas.json", "application/json", data);
      return json(req, res, 200, data);
    }
    if (url.pathname === "/api/export/unity" && req.method === "GET") {
      const data = unityMetadata(readProject());
      repository.recordExport("unity", "unity.json", "application/json", data);
      return json(req, res, 200, data);
    }
    if (url.pathname === "/api/export/json" && req.method === "GET")
      return json(req, res, 200, repository.exportJson());

    if (url.pathname === "/api/login" && req.method === "POST") {
      const data = parseBody(await body(req), LoginSchema);
      const user = repository.upsertUser(data);
      return json(req, res, 200, { ok: true, user, token: user.id });
    }
    if (url.pathname === "/api/gallery" && req.method === "GET") {
      return json(req, res, 200, repository.listGallery());
    }
    if (url.pathname === "/api/gallery" && req.method === "POST") {
      const data = parseBody(await body(req), GalleryPostSchema);
      const project = expandProject(data.project || readProject());
      const thumbnail = renderProjectPng(project).toString("base64");
      const item = repository.addGalleryProject({
        name: data.name || project.godot.asset || "pixel_asset",
        project,
        thumbnailBase64: thumbnail,
      });
      return json(req, res, 200, { ...item, project });
    }
    if (url.pathname.startsWith("/api/gallery/") && req.method === "GET") {
      const project = repository.getGalleryProject(
        url.pathname.split("/").pop() || "",
      );
      return project
        ? json(req, res, 200, project)
        : json(req, res, 404, { error: "not_found" });
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      return json(
        req,
        res,
        200,
        repository.listHistory().map((h) => ({
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
          source: h.command.source,
          params: h.command.params || {},
          diff: h.command.params?.diff,
          tool: h.command.params?.tool,
          prompt: h.command.params?.prompt,
          timestamp: h.command.params?.timestamp || h.at,
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
    `[pixel-bridge] http://${HOST}:${PORT} sqlite=${SQLITE_PATH} ai=${aiProvider.name}`,
  );
});
