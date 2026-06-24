import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import { z } from "zod";

const SIZE = 256;
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
type GodotMeta = {
  asset: string;
  animation: string;
  direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  fps: number;
  loop: boolean;
};
type Project = {
  size: number;
  frames: Frame[];
  activeFrameId: string;
  palette?: string[];
  godot?: GodotMeta;
  quality?: Record<string, unknown>;
};
const projectPath =
  process.env.PIXEL_PROJECT_PATH || "./pixel-project.mcp.json";
const id = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const index = (x: number, y: number) => y * SIZE + x;
const slug = (v: string) =>
  String(v || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";
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
const blankLayer = (name = "Layer"): Layer => ({
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
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
function normalizeProject(input: any): Project {
  const p: any = input && typeof input === "object" ? clone(input) : {};
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
    delete p.layers;
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
  if (!p.frames.some((f: Frame) => f.id === p.activeFrameId))
    p.activeFrameId = p.frames[0].id;
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
let project: Project = fs.existsSync(projectPath)
  ? normalizeProject(JSON.parse(fs.readFileSync(projectPath, "utf8")))
  : normalizeProject({ frames: [blankFrame()] });
const save = () =>
  fs.writeFileSync(
    projectPath,
    JSON.stringify(normalizeProject(project), null, 2),
  );
const activeFrame = () =>
  project.frames.find((f) => f.id === project.activeFrameId) ||
  project.frames[0];
const frameByNameOrActive = (name?: string) =>
  name
    ? project.frames.find((f) => f.name === name || f.id === name)
    : activeFrame();
const layerByName = (frame: Frame, name?: string) =>
  name
    ? frame.layers.find((l) => l.name === name || l.id === name)
    : frame.layers.find((l) => l.id === frame.activeLayerId) || frame.layers[0];
function drawRect(
  layer: Layer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  for (let yy = y; yy < Math.min(SIZE, y + h); yy++)
    for (let xx = x; xx < Math.min(SIZE, x + w); xx++)
      if (xx >= 0 && yy >= 0) layer.pixels[index(xx, yy)] = color;
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
          layer.pixels[index(px, py)] = color;
      }
}
function generateFromPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
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
  project = normalizeProject(project);
  project.frames = [];
  project.activeFrameId = "";
  project.godot = {
    ...(project.godot as GodotMeta),
    animation: anim,
    direction: direction as GodotMeta["direction"],
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
    project.frames.push(f);
    if (!project.activeFrameId) project.activeFrameId = f.id;
  }
  project.palette = [...new Set([...Object.values(c), ...defaultPalette])];
  save();
}
function godotMetadata() {
  const g = project.godot || {
    asset: "pixel_asset",
    animation: "idle_w",
    direction: "W",
    fps: 6,
    loop: true,
  };
  const asset = slug(g.asset),
    anim = slug(g.animation);
  return {
    asset,
    engine: "godot",
    godot_version: "4.x",
    frame_width: SIZE,
    frame_height: SIZE,
    import: {
      filter: false,
      mipmaps: false,
      repeat: "disabled",
      compression: "lossless",
      texture_type: "2D",
    },
    files: {
      spritesheet: `res://assets/${asset}/spritesheets/${asset}_${anim}_sheet.png`,
      atlas: `res://assets/${asset}/metadata/${asset}_${anim}.atlas.json`,
    },
    animations: [
      {
        name: anim,
        direction: g.direction,
        fps: g.fps,
        loop: g.loop,
        frames: project.frames.length,
        layout: "horizontal",
        frame_rects: project.frames.map((_, i) => ({
          x: i * SIZE,
          y: 0,
          w: SIZE,
          h: SIZE,
        })),
      },
    ],
  };
}
const server = new McpServer({ name: "pixel-art-256-mcp", version: "2.0.0" });
server.tool(
  "create_frame",
  "Cria um frame novo para spritesheet/animação.",
  {
    name: z.string().default("Frame"),
    duration: z.number().int().min(1).max(5000).default(100),
  },
  async ({ name, duration }) => {
    const f = blankFrame(name);
    f.duration = duration;
    project.frames.push(f);
    project.activeFrameId = f.id;
    save();
    return { content: [{ type: "text", text: `Frame criado: ${name}` }] };
  },
);
server.tool("duplicate_frame", "Duplica o frame ativo.", {}, async () => {
  const f = clone(activeFrame());
  f.id = id();
  f.name = `${f.name} copy`;
  f.layers.forEach((l) => (l.id = id()));
  f.activeLayerId = f.layers[0].id;
  project.frames.push(f);
  project.activeFrameId = f.id;
  save();
  return { content: [{ type: "text", text: "Frame duplicado." }] };
});
server.tool(
  "set_active_frame",
  "Seleciona frame por nome ou id.",
  { frame: z.string() },
  async ({ frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    project.activeFrameId = f.id;
    save();
    return { content: [{ type: "text", text: `Frame ativo: ${f.name}` }] };
  },
);
server.tool(
  "create_layer",
  "Cria uma camada nova no frame ativo.",
  { name: z.string(), frame: z.string().optional() },
  async ({ name, frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    const l = blankLayer(name);
    f.layers.push(l);
    f.activeLayerId = l.id;
    save();
    return { content: [{ type: "text", text: `Camada criada: ${name}` }] };
  },
);
server.tool(
  "set_pixel",
  "Pinta 1 pixel em x/y no frame/camada.",
  {
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x, y, color, layer, frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    const l = layerByName(f, layer);
    if (!l) throw new Error("Camada não encontrada");
    l.pixels[index(x, y)] = color;
    save();
    return { content: [{ type: "text", text: "ok" }] };
  },
);
server.tool(
  "draw_rect",
  "Desenha retângulo preenchido.",
  {
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    w: z.number().int().min(1).max(256),
    h: z.number().int().min(1).max(256),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x, y, w, h, color, layer, frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    const l = layerByName(f, layer);
    if (!l) throw new Error("Camada não encontrada");
    drawRect(l, x, y, w, h, color);
    save();
    return { content: [{ type: "text", text: "ok" }] };
  },
);
server.tool(
  "draw_line",
  "Desenha linha Bresenham.",
  {
    x1: z.number().int().min(0).max(255),
    y1: z.number().int().min(0).max(255),
    x2: z.number().int().min(0).max(255),
    y2: z.number().int().min(0).max(255),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x1, y1, x2, y2, color, layer, frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    const l = layerByName(f, layer);
    if (!l) throw new Error("Camada não encontrada");
    let dx = Math.abs(x2 - x1),
      sx = x1 < x2 ? 1 : -1,
      dy = -Math.abs(y2 - y1),
      sy = y1 < y2 ? 1 : -1,
      err = dx + dy;
    while (true) {
      l.pixels[index(x1, y1)] = color;
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x1 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y1 += sy;
      }
    }
    save();
    return { content: [{ type: "text", text: "ok" }] };
  },
);
server.tool(
  "clear_layer",
  "Limpa camada.",
  { layer: z.string().optional(), frame: z.string().optional() },
  async ({ layer, frame }) => {
    const f = frameByNameOrActive(frame);
    if (!f) throw new Error("Frame não encontrado");
    const l = layerByName(f, layer);
    if (!l) throw new Error("Camada não encontrada");
    l.pixels.fill(null);
    save();
    return { content: [{ type: "text", text: "ok" }] };
  },
);
server.tool(
  "set_godot_metadata",
  "Define metadados de exportação compatíveis com Godot 4.",
  {
    asset: z.string().default("pixel_asset"),
    animation: z.string().default("idle_w"),
    direction: z
      .enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
      .default("W"),
    fps: z.number().int().min(1).max(60).default(6),
    loop: z.boolean().default(true),
  },
  async ({ asset, animation, direction, fps, loop }) => {
    project.godot = { asset, animation, direction, fps, loop };
    save();
    return {
      content: [{ type: "text", text: "Metadados Godot atualizados." }],
    };
  },
);
server.tool(
  "draw_sprite_from_prompt",
  "Gera um sprite animado simples por prompt e salva no projeto compartilhado com o editor.",
  { prompt: z.string() },
  async ({ prompt }) => {
    generateFromPrompt(prompt);
    return {
      content: [
        {
          type: "text",
          text: `Prompt aplicado. Frames: ${project.frames.length}`,
        },
      ],
    };
  },
);
server.tool(
  "apply_project_json",
  "Substitui o projeto inteiro usando JSON gerado pela IA.",
  { json: z.string() },
  async ({ json }) => {
    project = normalizeProject(JSON.parse(json));
    save();
    return { content: [{ type: "text", text: "Projeto aplicado." }] };
  },
);
server.tool(
  "get_project_json",
  "Retorna o JSON do projeto para o editor web.",
  {},
  async () => ({
    content: [
      { type: "text", text: JSON.stringify(normalizeProject(project)) },
    ],
  }),
);
server.tool(
  "get_godot_json",
  "Retorna metadata JSON compatível com Godot 4.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(godotMetadata(), null, 2) }],
  }),
);

await server.connect(new StdioServerTransport());
