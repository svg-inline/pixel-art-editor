import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { process } from "zod/v4/core";
import {
  activeFrameOf,
  atlasMetadata,
  blankFrame,
  blankLayer,
  clearLayer,
  compactProject,
  compositeFrameRgba,
  createVariation,
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
import { encodePngRgba } from "./png.ts";

const projectPath = path.resolve(
  process.env.PIXEL_PROJECT_PATH || "./pixel-project.mcp.json",
);
const writeCompact = process.env.PIXEL_PROJECT_COMPACT !== "0";
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
let project: Project = expandProject(readJson(projectPath, {}));
function reload() {
  project = expandProject(readJson(projectPath, project));
  return project;
}
function save() {
  project = expandProject(project);
  atomicWrite(
    projectPath,
    JSON.stringify(writeCompact ? compactProject(project) : project, null, 2),
  );
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
  return encodePngRgba(SIZE, SIZE, compositeFrameRgba(frame)).toString(
    "base64",
  );
}
function spritesheetBase64() {
  reload();
  const width = SIZE * project.frames.length;
  const rgba = new Uint8Array(width * SIZE * 4);
  project.frames.forEach((frame, fi) => {
    const frameRgba = compositeFrameRgba(frame);
    for (let y = 0; y < SIZE; y++)
      rgba.set(
        frameRgba.subarray(y * SIZE * 4, y * SIZE * 4 + SIZE * 4),
        (y * width + fi * SIZE) * 4,
      );
  });
  return encodePngRgba(width, SIZE, rgba).toString("base64");
}

const server = new McpServer({ name: "pixel-art-256-mcp", version: "3.0.0" });

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
    save();
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
  save();
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
    save();
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
    save();
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
    save();
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
    save();
    return ok("ok");
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
    const f = getFrame(frame);
    drawLine(getLayer(f, layer), x1, y1, x2, y2, color);
    save();
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
    save();
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
    save();
    return ok("Metadados Godot atualizados.");
  },
);

server.tool(
  "generate_pixel_art",
  "Gera sprite/frames a partir de prompt e salva no projeto compartilhado.",
  { prompt: z.string() },
  async ({ prompt }) => {
    reload();
    project = generatePixelArtFromPrompt(prompt, project);
    save();
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
    save();
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
    save();
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
    save();
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
    save();
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
    save();
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
    save();
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
    save();
    return ok(`Paleta limitada para ${maxColors} cores.`);
  },
);

server.tool(
  "extend_animation",
  "Estende a animação até totalFrames, duplicando frames-base.",
  { totalFrames: z.number().int().min(1).max(64).default(8) },
  async ({ totalFrames }) => {
    reload();
    project = extendAnimation(project, totalFrames);
    save();
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
    save();
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
