import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { loadLocalEnv } from "./load-env.ts";
import {
  activeFrameOf,
  atlasMetadata,
  blankFrame,
  blankLayer,
  centerObject,
  clearLayer,
  compactProject,
  compositeFrameRgba,
  createVariation,
  drawCircle,
  drawEllipse,
  drawEllipseOutline,
  drawLine,
  drawRect,
  editSelection,
  expandProject,
  extendAnimation,
  frameByName,
  generatePixelArtFromPrompt,
  godotMetadata,
  layerByName,
  limitColors,
  objectBounds,
  qualityReport,
  replaceGlobalColor,
  setPixel,
  SIZE,
  slug,
  uid,
  unityMetadata,
  type Direction,
  type Project,
} from "../shared/pixel-core.ts";
import {
  createProjectCommand,
  HISTORY_LIMIT,
  isHistoryCommand,
  type HistoryCommand,
  type HistoryCommandName,
} from "../shared/history.ts";
import { encodePngRgba } from "./png.ts";
import {
  defaultDbPath,
  defaultProjectPath,
  migrateRuntimeFiles,
  writeInitialRuntimeFiles,
} from "./runtime-files.ts";

loadLocalEnv();

const projectPath = path.resolve(
  process.env.PIXEL_PROJECT_PATH || defaultProjectPath(),
);
const dbPath = path.resolve(process.env.PIXEL_DB_PATH || defaultDbPath());
const writeCompact = process.env.PIXEL_PROJECT_COMPACT !== "0";
type Db = { users: any[]; gallery: any[]; history: HistoryCommand[] };
function readJson(filePath: string, fallback: any) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  return text.trim() ? JSON.parse(text) : fallback;
}
function atomicWrite(filePath: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}
function readDb(): Db {
  const db = readJson(dbPath, { users: [], gallery: [], history: [] });
  return {
    users: Array.isArray(db.users) ? db.users : [],
    gallery: Array.isArray(db.gallery) ? db.gallery : [],
    history: Array.isArray(db.history)
      ? db.history.filter(isHistoryCommand).slice(0, HISTORY_LIMIT)
      : [],
  };
}
function writeDb(db: Db) {
  atomicWrite(dbPath, JSON.stringify(db, null, 2));
}
function migrateDbHistory() {
  const raw = readJson(dbPath, { users: [], gallery: [], history: [] });
  const db = readDb();
  if (
    !Array.isArray(raw.history) ||
    raw.history.length !== db.history.length ||
    raw.history.some((entry: any) => !isHistoryCommand(entry))
  )
    writeDb(db);
}
migrateRuntimeFiles(projectPath, dbPath);
writeInitialRuntimeFiles(projectPath, dbPath);

let project: Project = expandProject(readJson(projectPath, {}));
function reload() {
  project = expandProject(readJson(projectPath, project));
  return project;
}
function save(
  historyType: HistoryCommandName = "project.change",
  params?: Record<string, unknown>,
) {
  const current = expandProject(readJson(projectPath, {}));
  project = expandProject(project);
  project.revision = Math.max(current.revision, project.revision) + 1;
  atomicWrite(
    projectPath,
    JSON.stringify(writeCompact ? compactProject(project) : project, null, 2),
  );
  const historyCommand = createProjectCommand(
    current,
    project,
    historyType,
    params,
    "mcp",
  );
  if (historyCommand) {
    const db = readDb();
    db.history.unshift(historyCommand);
    db.history = db.history.slice(0, HISTORY_LIMIT);
    writeDb(db);
  }
}
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function getFrame(frame?: string) {
  reload();
  const f = frameByName(project, frame);
  if (!f) throw new Error("Frame não encontrado");
  return f;
}
function getLayer(frame: any, layer?: string) {
  const l = layerByName(frame, layer);
  if (!l) throw new Error("Camada não encontrada");
  return l;
}
function previewBase64(frameIndex = 0) {
  reload();
  const frame =
    project.frames[
      Math.max(0, Math.min(project.frames.length - 1, frameIndex))
    ] || activeFrameOf(project);
  return encodePngRgba(
    SIZE,
    SIZE,
    compositeFrameRgba(frame, project.background),
  ).toString("base64");
}
function spritesheetBase64() {
  reload();
  const width = SIZE * project.frames.length;
  const rgba = new Uint8Array(width * SIZE * 4);
  project.frames.forEach((frame, fi) => {
    const frameRgba = compositeFrameRgba(frame, project.background);
    for (let y = 0; y < SIZE; y++)
      rgba.set(
        frameRgba.subarray(y * SIZE * 4, y * SIZE * 4 + SIZE * 4),
        (y * width + fi * SIZE) * 4,
      );
  });
  return encodePngRgba(width, SIZE, rgba).toString("base64");
}

const server = new McpServer({ name: "pixel-art-256-mcp", version: "3.0.0" });

migrateDbHistory();

server.tool(
  "create_frame",
  "Cria um frame novo para spritesheet/animação.",
  {
    name: z.string().default("Frame"),
    duration: z.number().int().min(1).max(5000).default(100),
  },
  async ({ name, duration }) => {
    reload();
    const f = blankFrame(name);
    f.duration = duration;
    project.frames.push(f);
    project.activeFrameId = f.id;
    save("frame.add", { name, duration });
    return ok(`Frame criado: ${name}`);
  },
);

server.tool("duplicate_frame", "Duplica o frame ativo.", {}, async () => {
  reload();
  const source = activeFrameOf(project);
  const f = JSON.parse(JSON.stringify(source));
  f.id = uid();
  f.name = `${f.name} copy`;
  f.layers.forEach((l: any) => (l.id = uid()));
  f.activeLayerId = f.layers[0].id;
  project.frames.push(f);
  project.activeFrameId = f.id;
  save("frame.duplicate");
  return ok("Frame duplicado.");
});

server.tool(
  "set_active_frame",
  "Seleciona frame por nome ou id.",
  { frame: z.string() },
  async ({ frame }) => {
    reload();
    const f = frameByName(project, frame);
    if (!f) throw new Error("Frame não encontrado");
    project.activeFrameId = f.id;
    save("project.change", { operation: "set_active_frame", frame });
    return ok(`Frame ativo: ${f.name}`);
  },
);

server.tool(
  "create_layer",
  "Cria uma camada nova no frame ativo.",
  { name: z.string(), frame: z.string().optional() },
  async ({ name, frame }) => {
    const f = getFrame(frame);
    const l = blankLayer(name);
    f.layers.push(l);
    f.activeLayerId = l.id;
    save("layer.add", { name, frame });
    return ok(`Camada criada: ${name}`);
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
    const f = getFrame(frame);
    setPixel(getLayer(f, layer), x, y, color);
    save("setPixel", { x, y, color, layer, frame });
    return ok("ok");
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
    const f = getFrame(frame);
    drawRect(getLayer(f, layer), x, y, w, h, color);
    save("drawRect", { x, y, w, h, color, layer, frame });
    return ok("ok");
  },
);

server.tool(
  "draw_ellipse",
  "Desenha elipse preenchida.",
  {
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    rx: z.number().int().min(1).max(128),
    ry: z.number().int().min(1).max(128),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x, y, rx, ry, color, layer, frame }) => {
    const f = getFrame(frame);
    drawEllipse(getLayer(f, layer), x, y, rx, ry, color);
    save("project.change", {
      operation: "draw_ellipse",
      x,
      y,
      rx,
      ry,
      color,
      layer,
      frame,
    });
    return ok("ok");
  },
);

server.tool(
  "draw_circle",
  "Desenha círculo preenchido.",
  {
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    r: z.number().int().min(1).max(128),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x, y, r, color, layer, frame }) => {
    const f = getFrame(frame);
    drawCircle(getLayer(f, layer), x, y, r, color);
    save("project.change", {
      operation: "draw_circle",
      x,
      y,
      r,
      color,
      layer,
      frame,
    });
    return ok("ok");
  },
);

server.tool(
  "draw_ellipse_outline",
  "Desenha contorno de elipse com espessura.",
  {
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    rx: z.number().int().min(1).max(128),
    ry: z.number().int().min(1).max(128),
    thickness: z.number().int().min(1).max(64).default(4),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x, y, rx, ry, thickness, color, layer, frame }) => {
    const f = getFrame(frame);
    drawEllipseOutline(getLayer(f, layer), x, y, rx, ry, thickness, color);
    save("project.change", {
      operation: "draw_ellipse_outline",
      x,
      y,
      rx,
      ry,
      thickness,
      color,
      layer,
      frame,
    });
    return ok("ok");
  },
);

server.tool(
  "draw_line",
  "Desenha linha Bresenham com espessura opcional.",
  {
    x1: z.number().int().min(0).max(255),
    y1: z.number().int().min(0).max(255),
    x2: z.number().int().min(0).max(255),
    y2: z.number().int().min(0).max(255),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    thickness: z.number().int().min(1).max(32).default(1),
    layer: z.string().optional(),
    frame: z.string().optional(),
  },
  async ({ x1, y1, x2, y2, color, thickness, layer, frame }) => {
    const f = getFrame(frame);
    drawLine(getLayer(f, layer), x1, y1, x2, y2, color, thickness);
    save("drawLine", { x1, y1, x2, y2, color, thickness, layer, frame });
    return ok("ok");
  },
);

server.tool(
  "clear_layer",
  "Limpa camada.",
  { layer: z.string().optional(), frame: z.string().optional() },
  async ({ layer, frame }) => {
    const f = getFrame(frame);
    clearLayer(getLayer(f, layer));
    save("project.change", { operation: "clear_layer", layer, frame });
    return ok("ok");
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
    reload();
    project.godot = {
      asset,
      animation,
      direction: direction as Direction,
      fps,
      loop,
    };
    save("project.change", {
      operation: "set_godot_metadata",
      asset,
      animation,
      direction,
      fps,
      loop,
    });
    return ok("Metadados Godot atualizados.");
  },
);

server.tool(
  "set_background",
  "Define o fundo do projeto sem pintar pixels: transparente ou cor sólida.",
  {
    mode: z.enum(["transparent", "color"]).default("transparent"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
  },
  async ({ mode, color }) => {
    reload();
    project.background = {
      mode,
      color: color.toLowerCase(),
    };
    save("project.change", { operation: "set_background", mode, color });
    return ok(
      mode === "color"
        ? `Fundo definido como cor ${color.toLowerCase()}.`
        : "Fundo definido como transparente.",
    );
  },
);

server.tool(
  "generate_pixel_art",
  "Gera sprite/frames a partir de prompt e salva no projeto compartilhado.",
  { prompt: z.string() },
  async ({ prompt }) => {
    reload();
    project = generatePixelArtFromPrompt(prompt, project);
    save("project.replace", { operation: "generate_pixel_art", prompt });
    return ok(
      `Pixel art gerada. Frames: ${project.frames.length}, animação: ${project.godot.animation}`,
    );
  },
);

server.tool(
  "draw_sprite_from_prompt",
  "Alias compatível: gera sprite/frames por prompt.",
  { prompt: z.string() },
  async ({ prompt }) => {
    reload();
    project = generatePixelArtFromPrompt(prompt, project);
    save("project.replace", { operation: "draw_sprite_from_prompt", prompt });
    return ok(`Prompt aplicado. Frames: ${project.frames.length}`);
  },
);

server.tool(
  "edit_pixel_art",
  "Edita o projeto atual com instrução em linguagem natural.",
  { prompt: z.string(), layer: z.string().optional() },
  async ({ prompt, layer }) => {
    reload();
    project = editSelection(project, prompt, null, layer);
    save("project.change", { operation: "edit_pixel_art", prompt, layer });
    return ok("Edição aplicada no projeto.");
  },
);

server.tool(
  "edit_selection",
  "Edita apenas uma seleção retangular.",
  {
    prompt: z.string(),
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    w: z.number().int().min(1).max(256),
    h: z.number().int().min(1).max(256),
    layer: z.string().optional(),
  },
  async ({ prompt, x, y, w, h, layer }) => {
    reload();
    project = editSelection(
      project,
      prompt,
      { x, y, w: w - 1, h: h - 1 },
      layer,
    );
    save("project.change", {
      operation: "edit_selection",
      prompt,
      x,
      y,
      w,
      h,
      layer,
    });
    return ok("Seleção editada.");
  },
);

server.tool(
  "replace_subject",
  "Substitui/reestrutura a área selecionada usando uma descrição.",
  {
    prompt: z.string(),
    x: z.number().int().min(0).max(255).default(88),
    y: z.number().int().min(0).max(255).default(72),
    w: z.number().int().min(1).max(256).default(80),
    h: z.number().int().min(1).max(256).default(104),
    layer: z.string().optional(),
  },
  async ({ prompt, x, y, w, h, layer }) => {
    reload();
    project = editSelection(
      project,
      prompt,
      { x, y, w: w - 1, h: h - 1 },
      layer,
    );
    save("project.change", {
      operation: "replace_subject",
      prompt,
      x,
      y,
      w,
      h,
      layer,
    });
    return ok("Objeto/sujeito substituído na seleção.");
  },
);

server.tool(
  "create_variation",
  "Cria variação do projeto atual: mirror_h, mirror_v ou shift_right.",
  {
    variant: z
      .enum(["mirror_h", "mirror_v", "shift_right"])
      .default("mirror_h"),
  },
  async ({ variant }) => {
    reload();
    project = createVariation(project, variant);
    save("project.change", { operation: "create_variation", variant });
    return ok(`Variação criada: ${variant}`);
  },
);

server.tool(
  "recolor_palette",
  "Substitui uma cor globalmente.",
  {
    from: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    to: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  },
  async ({ from, to }) => {
    reload();
    project = replaceGlobalColor(project, from, to);
    save("project.change", { operation: "recolor_palette", from, to });
    return ok(`Cor substituída: ${from} → ${to}`);
  },
);

server.tool(
  "limit_palette",
  "Limita a arte às cores mais usadas.",
  { maxColors: z.number().int().min(2).max(256).default(32) },
  async ({ maxColors }) => {
    reload();
    project = limitColors(project, maxColors);
    save("project.change", { operation: "limit_palette", maxColors });
    return ok(`Paleta limitada para ${maxColors} cores.`);
  },
);

server.tool(
  "object_bounds",
  "Mede a área ocupada pelos pixels visíveis do objeto.",
  {},
  async () => {
    reload();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(objectBounds(project), null, 2),
        },
      ],
    };
  },
);

server.tool(
  "center_object",
  "Centraliza o objeto no canvas 256x256 preservando camadas e frames.",
  {},
  async () => {
    reload();
    project = centerObject(project);
    save("project.change", { operation: "center_object" });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(objectBounds(project), null, 2),
        },
      ],
    };
  },
);

server.tool(
  "extend_animation",
  "Estende a animação até totalFrames, duplicando frames-base.",
  { totalFrames: z.number().int().min(1).max(64).default(8) },
  async ({ totalFrames }) => {
    reload();
    project = extendAnimation(project, totalFrames);
    save("project.change", { operation: "extend_animation", totalFrames });
    return ok(`Animação com ${project.frames.length} frames.`);
  },
);

server.tool(
  "get_preview_png",
  "Retorna PNG base64 do frame selecionado.",
  { frameIndex: z.number().int().min(0).max(63).default(0) },
  async ({ frameIndex }) => ({
    content: [{ type: "text", text: previewBase64(frameIndex) }],
  }),
);

server.tool(
  "get_spritesheet_png",
  "Retorna spritesheet PNG base64.",
  {},
  async () => ({ content: [{ type: "text", text: spritesheetBase64() }] }),
);

server.tool(
  "export_godot_asset",
  "Retorna pacote JSON de metadata Godot + atlas + PNG base64.",
  {},
  async () => {
    reload();
    const asset = slug(project.godot.asset),
      anim = slug(project.godot.animation);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              asset,
              animation: anim,
              metadata: godotMetadata(project),
              atlas: atlasMetadata(project),
              spritesheet_png_base64: spritesheetBase64(),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "apply_project_json",
  "Substitui o projeto inteiro usando JSON.",
  { json: z.string() },
  async ({ json }) => {
    project = expandProject(JSON.parse(json));
    save("project.replace", { operation: "apply_project_json" });
    return ok("Projeto aplicado.");
  },
);

server.tool(
  "get_project_json",
  "Retorna JSON expandido do projeto.",
  {},
  async () => {
    reload();
    return { content: [{ type: "text", text: JSON.stringify(project) }] };
  },
);
server.tool(
  "get_project_compact_json",
  "Retorna JSON compacto RLE do projeto.",
  {},
  async () => {
    reload();
    return {
      content: [
        { type: "text", text: JSON.stringify(compactProject(project)) },
      ],
    };
  },
);
server.tool(
  "get_godot_json",
  "Retorna metadata JSON compatível com Godot 4.",
  {},
  async () => {
    reload();
    return {
      content: [
        { type: "text", text: JSON.stringify(godotMetadata(project), null, 2) },
      ],
    };
  },
);
server.tool("get_atlas_json", "Retorna atlas JSON.", {}, async () => {
  reload();
  return {
    content: [
      { type: "text", text: JSON.stringify(atlasMetadata(project), null, 2) },
    ],
  };
});
server.tool("get_unity_json", "Retorna metadata Unity JSON.", {}, async () => {
  reload();
  return {
    content: [
      { type: "text", text: JSON.stringify(unityMetadata(project), null, 2) },
    ],
  };
});
server.tool(
  "quality_report",
  "Retorna relatório de QA.",
  { maxColors: z.number().int().min(2).max(256).default(32) },
  async ({ maxColors }) => {
    reload();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(qualityReport(project, maxColors), null, 2),
        },
      ],
    };
  },
);

await server.connect(new StdioServerTransport());
