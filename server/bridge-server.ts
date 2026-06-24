import fs from "node:fs";
import http from "node:http";
import { URL } from "node:url";

const SIZE = 256;
const PORT = Number(process.env.PIXEL_BRIDGE_PORT || 8787);
const PROJECT_PATH =
  process.env.PIXEL_PROJECT_PATH || "./pixel-project.mcp.json";
const DB_PATH = process.env.PIXEL_DB_PATH || "./pixel-art-db.json";
type Layer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  pixels: (string | null)[];
};
type Frame = {
  id: string;
  name: string;
  duration: number;
  layers: Layer[];
  activeLayerId: string;
};
type Project = {
  size: number;
  frames: Frame[];
  activeFrameId: string;
  palette?: string[];
  godot?: any;
  quality?: any;
};
type Db = { users: any[]; gallery: any[]; history: any[] };
const id = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const idx = (x: number, y: number) => y * SIZE + x;
const blankLayer = (name = "Base"): Layer => ({
  id: id(),
  name,
  visible: true,
  opacity: 1,
  pixels: Array(SIZE * SIZE).fill(null),
});
const blankFrame = (name = "Frame 1"): Frame => {
  const l = blankLayer("Base");
  return { id: id(), name, duration: 100, layers: [l], activeLayerId: l.id };
};
const defaultPalette = [
  "#111827",
  "#374151",
  "#6b7280",
  "#d1d5db",
  "#f8fafc",
  "#7f1d1d",
  "#b45309",
  "#f59e0b",
  "#166534",
  "#22c55e",
  "#1d4ed8",
  "#60a5fa",
];
function normalizeProject(input: any): Project {
  const p: any =
    input && typeof input === "object" ? JSON.parse(JSON.stringify(input)) : {};
  p.size = SIZE;
  if (!Array.isArray(p.frames) || !p.frames.length) {
    const layers =
      Array.isArray(p.layers) && p.layers.length
        ? p.layers
        : [blankLayer("Base")];
    p.frames = [
      {
        id: id(),
        name: "Frame 1",
        duration: 100,
        layers,
        activeLayerId: p.activeLayerId || layers[0].id,
      },
    ];
  }
  p.frames = p.frames.map((f: any, i: number) => {
    const layers =
      Array.isArray(f.layers) && f.layers.length
        ? f.layers
        : [blankLayer("Base")];
    layers.forEach((l: any, li: number) => {
      l.id ||= id();
      l.name ||= `Layer ${li + 1}`;
      l.visible = l.visible !== false;
      l.opacity = Number.isFinite(Number(l.opacity)) ? Number(l.opacity) : 1;
      if (!Array.isArray(l.pixels) || l.pixels.length !== SIZE * SIZE)
        l.pixels = Array(SIZE * SIZE).fill(null);
    });
    return {
      ...f,
      id: f.id || id(),
      name: f.name || `Frame ${i + 1}`,
      duration: Number(f.duration || 100),
      layers,
      activeLayerId: f.activeLayerId || layers[0].id,
    };
  });
  p.activeFrameId ||= p.frames[0].id;
  p.palette =
    Array.isArray(p.palette) && p.palette.length ? p.palette : defaultPalette;
  p.godot = {
    ...{
      asset: "pixel_asset",
      animation: "idle_w",
      direction: "W",
      fps: 6,
      loop: true,
    },
    ...(p.godot || {}),
  };
  return p as Project;
}
function readProject(): Project {
  if (fs.existsSync(PROJECT_PATH))
    return normalizeProject(JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8")));
  const p = normalizeProject({ frames: [blankFrame()] });
  writeProject(p, false);
  return p;
}
function writeProject(project: Project, addHistory = true) {
  const p = normalizeProject(project);
  fs.writeFileSync(PROJECT_PATH, JSON.stringify(p, null, 2));
  if (addHistory) {
    const db = readDb();
    db.history.unshift({ id: id(), at: new Date().toISOString(), project: p });
    db.history = db.history.slice(0, 50);
    writeDb(db);
  }
  broadcastProject(p);
}
function readDb(): Db {
  if (!fs.existsSync(DB_PATH)) return { users: [], gallery: [], history: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function writeDb(db: Db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function drawRect(
  layer: Layer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE)
        layer.pixels[idx(xx, yy)] = color;
}
function drawEllipse(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  for (let yy = -ry; yy <= ry; yy++)
    for (let xx = -rx; xx <= rx; xx++)
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) {
        const px = x + xx,
          py = y + yy;
        if (px >= 0 && py >= 0 && px < SIZE && py < SIZE)
          layer.pixels[idx(px, py)] = color;
      }
}
function generateFromPrompt(prompt: string, base: any): Project {
  const lower = String(prompt || "").toLowerCase();
  const direction =
    lower.includes("oeste") || lower.includes("west")
      ? "W"
      : lower.includes("leste") || lower.includes("east")
        ? "E"
        : lower.includes("norte")
          ? "N"
          : "S";
  const isWalk = /walk|andar|movimento|correr/.test(lower);
  const isAttack = /attack|ataque|golpe/.test(lower);
  const frameCount = isAttack ? 6 : isWalk ? 8 : 4;
  const anim = `${isAttack ? "attack" : isWalk ? "walk" : "idle"}_${direction.toLowerCase()}`;
  const p = normalizeProject(base || {});
  p.frames = [];
  p.activeFrameId = "";
  p.godot = {
    ...p.godot,
    animation: anim,
    direction,
    fps: isAttack ? 10 : isWalk ? 8 : 6,
  };
  const c = {
    outline: "#111827",
    cloth: "#374151",
    leather: "#78350f",
    skin: "#d6a878",
    metal: "#9ca3af",
    shadow: "#1f2937",
    highlight: "#facc15",
  };
  for (let i = 0; i < frameCount; i++) {
    const f = blankFrame(`Frame ${i + 1}`);
    f.layers = [
      blankLayer("Silhueta"),
      blankLayer("Detalhes"),
      blankLayer("Sombra/Luz"),
    ];
    f.activeLayerId = f.layers[1].id;
    const body = f.layers[0],
      detail = f.layers[1],
      shade = f.layers[2];
    const bob = Math.round(Math.sin((i / frameCount) * Math.PI * 2) * 2);
    const step = isWalk
      ? Math.round(Math.sin((i / frameCount) * Math.PI * 2) * 5)
      : 0;
    const swing = isAttack ? i * 4 : 0;
    const lx = direction === "W" ? -1 : 1;
    const cx = 128,
      cy = 128 + bob;
    drawEllipse(body, cx, cy - 48, 18, 21, c.outline);
    drawRect(body, cx - 20, cy - 28, 40, 54, c.outline);
    drawRect(body, cx - 16, cy - 25, 32, 50, c.cloth);
    drawEllipse(detail, cx + lx * 6, cy - 50, 11, 13, c.skin);
    drawRect(detail, cx - 18, cy - 21, 36, 8, c.leather);
    drawRect(detail, cx + lx * 18, cy - 18, 10, 32, c.leather);
    drawRect(detail, cx - lx * 25, cy - 18, 9, 29, c.leather);
    drawRect(detail, cx - 16 + step, cy + 26, 10, 30, c.leather);
    drawRect(detail, cx + 6 - step, cy + 26, 10, 30, c.leather);
    drawRect(shade, cx - 18, cy + 12, 36, 7, c.shadow);
    drawRect(shade, cx + lx * 2, cy - 63, 12, 5, c.highlight);
    if (isAttack) {
      drawRect(detail, cx + lx * (28 + swing), cy - 24 - swing, 35, 5, c.metal);
      drawRect(detail, cx + lx * (62 + swing), cy - 27 - swing, 8, 11, c.metal);
    } else {
      drawRect(detail, cx + lx * 30, cy - 30, 5, 45, c.metal);
      drawRect(detail, cx + lx * 27, cy + 10, 12, 18, c.metal);
    }
    p.frames.push(f);
    if (!p.activeFrameId) p.activeFrameId = f.id;
  }
  p.palette = [...new Set([...Object.values(c), ...defaultPalette])];
  return p;
}
function json(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(data));
}
async function body(req: http.IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}
const clients = new Set<http.ServerResponse>();
function sendEvent(res: http.ServerResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcastProject(p = readProject()) {
  for (const res of clients) sendEvent(res, "project", p);
}
let lastMtime = 0;
fs.watchFile(PROJECT_PATH, { interval: 500 }, () => {
  try {
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
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      clients.add(res);
      sendEvent(res, "project", readProject());
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/api/project" && req.method === "GET")
      return json(res, 200, readProject());
    if (url.pathname === "/api/project" && req.method === "POST") {
      const data = await body(req);
      writeProject(normalizeProject(data));
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/ai-prompt" && req.method === "POST") {
      const data = await body(req);
      const project = generateFromPrompt(
        data.prompt,
        data.project || readProject(),
      );
      writeProject(project);
      return json(res, 200, project);
    }
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
      return json(res, 200, { ok: true, user, token: user.id });
    }
    if (url.pathname === "/api/gallery" && req.method === "GET") {
      const db = readDb();
      return json(
        res,
        200,
        db.gallery.map((g: any) => ({
          id: g.id,
          name: g.name,
          at: g.at,
          asset: g.project?.godot?.asset,
          frames: g.project?.frames?.length || 0,
        })),
      );
    }
    if (url.pathname === "/api/gallery" && req.method === "POST") {
      const data = await body(req);
      const db = readDb();
      const item = {
        id: id(),
        name: data.name || data.project?.godot?.asset || "pixel_asset",
        at: new Date().toISOString(),
        project: normalizeProject(data.project || readProject()),
      };
      db.gallery.unshift(item);
      writeDb(db);
      return json(res, 200, item);
    }
    if (url.pathname.startsWith("/api/gallery/") && req.method === "GET") {
      const db = readDb();
      const item = db.gallery.find(
        (g: any) => g.id === url.pathname.split("/").pop(),
      );
      return item
        ? json(res, 200, item.project)
        : json(res, 404, { error: "not_found" });
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      const db = readDb();
      return json(
        res,
        200,
        db.history.map((h: any) => ({
          id: h.id,
          at: h.at,
          frames: h.project?.frames?.length || 0,
          asset: h.project?.godot?.asset,
        })),
      );
    }
    return json(res, 404, { error: "not_found" });
  } catch (e: any) {
    return json(res, 500, { error: e?.message || "server_error" });
  }
});
server.listen(PORT, () =>
  console.error(
    `[pixel-bridge] http://localhost:${PORT} project=${PROJECT_PATH}`,
  ),
);
