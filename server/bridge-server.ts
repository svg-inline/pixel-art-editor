import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import {
  activeFrameOf,
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
import { createAiProvider } from "./ai/provider.ts";
import { encodePngRgba } from "./png.ts";

const PORT = Number(process.env.PIXEL_BRIDGE_PORT || 8787);
const HOST = process.env.PIXEL_BRIDGE_HOST || "127.0.0.1";
const PROJECT_PATH = path.resolve(
  process.env.PIXEL_PROJECT_PATH || "./pixel-project.mcp.json",
);
const DB_PATH = path.resolve(
  process.env.PIXEL_DB_PATH || "./pixel-art-db.json",
);
const BODY_LIMIT = Number(
  process.env.PIXEL_BRIDGE_BODY_LIMIT || 64 * 1024 * 1024,
);
const TOKEN = process.env.PIXEL_BRIDGE_TOKEN || "";
const aiProvider = createAiProvider();

type Db = { users: any[]; gallery: any[]; history: any[] };
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
  return readJsonFile(DB_PATH, { users: [], gallery: [], history: [] });
}
function writeDb(db: Db) {
  atomicWrite(DB_PATH, JSON.stringify(db, null, 2));
}
async function writeProject(projectInput: any, addHistory = true) {
  const project = expandProject(projectInput);
  writeQueue = writeQueue.then(() => {
    atomicWrite(PROJECT_PATH, JSON.stringify(compactProject(project), null, 2));
    if (addHistory) {
      const db = readDb();
      db.history.unshift({
        id: id(),
        at: new Date().toISOString(),
        project: compactProject(project),
      });
      db.history = db.history.slice(0, 50);
      writeDb(db);
    }
    lastMtime = fs.existsSync(PROJECT_PATH)
      ? fs.statSync(PROJECT_PATH).mtimeMs
      : lastMtime;
    broadcastProject(project);
  });
  await writeQueue;
  return project;
}
function sendEvent(res: http.ServerResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcastProject(project = readProject()) {
  const expanded = expandProject(project);
  for (const res of clients) sendEvent(res, "project", expanded);
}
function corsHeaders(req: http.IncomingMessage) {
  const origin = req.headers.origin || "";
  const allowedOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
    String(origin),
  )
    ? String(origin)
    : "*";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-pixel-token",
    vary: "origin",
  };
}
function json(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  data: any,
) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(req),
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
    ...corsHeaders(req),
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
function requireToken(req: http.IncomingMessage) {
  if (!TOKEN) return true;
  return (
    req.headers["x-pixel-token"] === TOKEN ||
    req.headers.authorization === `Bearer ${TOKEN}`
  );
}
function renderProjectPng(project: Project, frameIndex = 0) {
  const frame =
    project.frames[
      Math.max(0, Math.min(project.frames.length - 1, frameIndex))
    ] || activeFrameOf(project);
  return encodePngRgba(SIZE, SIZE, compositeFrameRgba(frame));
}
function renderSpritesheetPng(project: Project) {
  const width = SIZE * project.frames.length;
  const height = SIZE;
  const sheet = new Uint8Array(width * height * 4);
  project.frames.forEach((frame, fi) => {
    const rgba = compositeFrameRgba(frame);
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
  if (req.method === "OPTIONS") return json(req, res, 200, { ok: true });
  if (!requireToken(req)) return json(req, res, 401, { error: "unauthorized" });
  try {
    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        ...corsHeaders(req),
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
    if (url.pathname === "/api/project" && req.method === "POST")
      return json(req, res, 200, await writeProject(await body(req)));

    if (url.pathname === "/api/ai-prompt" && req.method === "POST") {
      const data = await body(req);
      const project = await aiProvider.run({
        prompt: data.prompt,
        operation: data.operation || "generate",
        project: data.project || readProject(),
        selection: data.selection || null,
        layer: data.layer,
        from: data.from,
        to: data.to,
        maxColors: data.maxColors,
      });
      return json(req, res, 200, await writeProject(project));
    }
    if (url.pathname === "/api/tools/edit-selection" && req.method === "POST") {
      const data = await body(req);
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
        ),
      );
    }
    if (
      url.pathname === "/api/tools/recolor-palette" &&
      req.method === "POST"
    ) {
      const data = await body(req);
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
        ),
      );
    }
    if (url.pathname === "/api/tools/limit-colors" && req.method === "POST") {
      const data = await body(req);
      return json(
        req,
        res,
        200,
        await writeProject(
          limitColors(
            expandProject(data.project || readProject()),
            Number(data.maxColors || 32),
          ),
        ),
      );
    }
    if (
      url.pathname === "/api/tools/create-variation" &&
      req.method === "POST"
    ) {
      const data = await body(req);
      return json(
        req,
        res,
        200,
        await writeProject(
          createVariation(
            data.project || readProject(),
            data.variant || data.prompt || "mirror_h",
          ),
        ),
      );
    }
    if (
      url.pathname === "/api/tools/extend-animation" &&
      req.method === "POST"
    ) {
      const data = await body(req);
      return json(
        req,
        res,
        200,
        await writeProject(
          extendAnimation(
            data.project || readProject(),
            Number(data.totalFrames || 8),
          ),
        ),
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
    if (url.pathname === "/api/export/godot" && req.method === "GET")
      return json(req, res, 200, godotMetadata(readProject()));
    if (url.pathname === "/api/export/atlas" && req.method === "GET")
      return json(req, res, 200, atlasMetadata(readProject()));
    if (url.pathname === "/api/export/unity" && req.method === "GET")
      return json(req, res, 200, unityMetadata(readProject()));

    if (url.pathname === "/api/login" && req.method === "POST") {
      const data = await body(req);
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
      const data = await body(req);
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
        db.history.map((h: any) => {
          const p = expandProject(h.project);
          return {
            id: h.id,
            at: h.at,
            frames: p.frames.length,
            asset: p.godot.asset,
          };
        }),
      );
    }
    return json(req, res, 404, { error: "not_found" });
  } catch (e: any) {
    return json(req, res, 500, { error: e?.message || "server_error" });
  }
});

server.listen(PORT, HOST, () => {
  console.error(
    `[pixel-bridge] http://${HOST}:${PORT} project=${PROJECT_PATH} ai=${aiProvider.name}`,
  );
});
