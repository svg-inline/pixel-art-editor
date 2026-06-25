import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { loadLocalEnv } from "./load-env.ts";
import {
  activeFrameOf,
  activeAnimationOf,
  activeAssetOf,
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
  expandProject,
  extendAnimation,
  frameByName,
  godotMetadata,
  layerByName,
  limitColors,
  objectBounds,
  qualityReport,
  replaceGlobalColor,
  setPixel,
  SIZE,
  slug,
  syncActiveAnimationMeta,
  uid,
  unityMetadata,
  type Direction,
  type Project,
} from "../shared/pixel-core.ts";
import {
  type HistoryCommandName,
} from "../shared/history.ts";
import {
  createProjectDiff,
  previewProjectDiff,
  type ProjectDiffSummary,
} from "../shared/diff.ts";
import type { ProjectDiff } from "../shared/schema.ts";
import { createAiProvider, type AiOperation } from "./ai/provider.ts";
import { ProjectRepository } from "./db.ts";
import { encodePngRgba } from "./png.ts";
import {
  defaultDbPath,
  defaultProjectPath,
  defaultSqlitePath,
  migrateRuntimeFiles,
} from "./runtime-files.ts";

loadLocalEnv();

const legacyProjectPath = path.resolve(
  process.env.PIXEL_PROJECT_PATH || defaultProjectPath(),
);
const legacyDbPath = path.resolve(process.env.PIXEL_DB_PATH || defaultDbPath());
const sqlitePath = path.resolve(
  process.env.PIXEL_SQLITE_PATH || defaultSqlitePath(),
);
const aiProvider = createAiProvider();
migrateRuntimeFiles(legacyProjectPath, legacyDbPath);
const repository = new ProjectRepository(sqlitePath, {
  legacyProjectPath,
  legacyDbPath,
});

let project: Project = repository.getProject();
let lastProposal:
  | {
      previewId: string;
      diff: ProjectDiff;
      summary: ProjectDiffSummary;
    }
  | null = null;
function reload() {
  project = repository.getProject();
  return project;
}
function save(
  historyType: HistoryCommandName = "project.change",
  params?: Record<string, unknown>,
) {
  const before = repository.getProject();
  const tool = String(params?.operation || historyType);
  const prompt = typeof params?.prompt === "string" ? params.prompt : undefined;
  const diff = createProjectDiff(before, project, {
    source: "mcp",
    tool,
    prompt,
    params: {
      historyType,
      ...(params || {}),
    },
  });
  if (!diff) {
    lastProposal = null;
    return null;
  }
  const preview = previewProjectDiff(before, diff);
  const pending = repository.addPendingDiff({
    diff,
    source: "mcp",
    command: diff.command,
  });
  lastProposal = {
    previewId: pending.id,
    diff,
    summary: preview.summary,
  };
  return lastProposal;
}
function applySave(
  historyType: HistoryCommandName = "project.change",
  params?: Record<string, unknown>,
) {
  project = repository.saveProject(project, {
    historyType,
    historyParams: params,
    historySource: "mcp",
  });
}
function ok(text: string) {
  if (lastProposal) {
    const proposal = lastProposal;
    lastProposal = null;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              message: text,
              status: "preview_pending_acceptance",
              previewId: proposal.previewId,
              diff: proposal.diff,
              summary: proposal.summary,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
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
async function runAiTool(
  prompt: string,
  operation: AiOperation,
  input?: {
    selection?: { x: number; y: number; w: number; h: number } | null;
    layer?: string;
  },
) {
  reload();
  return aiProvider.generate({
    prompt,
    operation,
    project,
    selection: input?.selection || null,
    layer: input?.layer,
    palette: project.palette,
  });
}
function godotAssetSpritesheetBase64() {
  reload();
  const asset = activeAssetOf(project);
  const width = SIZE * Math.max(
    1,
    ...asset.animations.map((animation) => animation.frames.length),
  );
  const height = SIZE * Math.max(1, asset.animations.length);
  const rgba = new Uint8Array(width * height * 4);
  asset.animations.forEach((animation, row) => {
    animation.frames.forEach((frame, frameIndex) => {
      const frameRgba = compositeFrameRgba(frame, project.background);
      for (let y = 0; y < SIZE; y++)
        rgba.set(
          frameRgba.subarray(y * SIZE * 4, y * SIZE * 4 + SIZE * 4),
          ((row * SIZE + y) * width + frameIndex * SIZE) * 4,
        );
    });
  });
  return encodePngRgba(width, height, rgba).toString("base64");
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
  "set_active_asset",
  "Seleciona asset por nome ou id.",
  { asset: z.string() },
  async ({ asset }) => {
    reload();
    const found = project.assets.find((item) => item.id === asset || item.name === asset);
    if (!found) throw new Error("Asset não encontrado");
    project.activeAssetId = found.id;
    project.activeAnimationId = found.animations[0].id;
    project.activeFrameId = found.animations[0].frames[0]?.id || "";
    save("project.change", { operation: "set_active_asset", asset });
    return ok(`Asset ativo: ${found.name}`);
  },
);

server.tool(
  "set_active_animation",
  "Seleciona animação por nome/id e direção opcional.",
  {
    animation: z.string(),
    direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).optional(),
  },
  async ({ animation, direction }) => {
    reload();
    const asset = activeAssetOf(project);
    const found = asset.animations.find(
      (item) =>
        (item.id === animation || item.name === animation) &&
        (!direction || item.direction === direction),
    );
    if (!found) throw new Error("Animação não encontrada");
    project.activeAnimationId = found.id;
    project.activeFrameId = found.frames[0]?.id || "";
    save("project.change", { operation: "set_active_animation", animation, direction });
    return ok(`Animação ativa: ${found.name} ${found.direction}`);
  },
);

server.tool(
  "create_animation",
  "Cria animação no asset ativo com direção/fps/loop.",
  {
    name: z.string(),
    direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).default("S"),
    fps: z.number().int().min(1).max(60).default(6),
    loop: z.boolean().default(true),
  },
  async ({ name, direction, fps, loop }) => {
    reload();
    const asset = activeAssetOf(project);
    const frame = blankFrame("Frame 1");
    const animation = {
      id: uid(),
      name,
      direction: direction as Direction,
      fps,
      loop,
      frames: [frame],
    };
    asset.animations.push(animation);
    project.activeAnimationId = animation.id;
    project.activeFrameId = frame.id;
    save("project.change", { operation: "create_animation", name, direction, fps, loop });
    return ok(`Animação criada: ${name} ${direction}`);
  },
);

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
    syncActiveAnimationMeta(project);
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
  "Gera sprite/frames por provider de IA configurado e salva no projeto.",
  { prompt: z.string() },
  async ({ prompt }) => {
    const result = await runAiTool(prompt, "generate");
    project = result.project;
    save("project.replace", {
      operation: "generate_pixel_art",
      prompt,
      provider: result.provider,
      providerKind: result.providerKind,
      model: result.model,
    });
    return ok(
      `Preview aplicado via ${result.provider}. Frames: ${project.frames.length}, animação: ${project.godot.animation}`,
    );
  },
);

server.tool(
  "draw_sprite_from_prompt",
  "Alias compatível: gera sprite/frames por provider de IA configurado.",
  { prompt: z.string() },
  async ({ prompt }) => {
    const result = await runAiTool(prompt, "generate");
    project = result.project;
    save("project.replace", {
      operation: "draw_sprite_from_prompt",
      prompt,
      provider: result.provider,
      providerKind: result.providerKind,
      model: result.model,
    });
    return ok(`Prompt aplicado via ${result.provider}. Frames: ${project.frames.length}`);
  },
);

server.tool(
  "preview_ai_prompt",
  "Gera preview PNG base64 via provider de IA sem salvar o projeto.",
  {
    prompt: z.string(),
    operation: z
      .enum(["generate", "edit", "edit_selection", "replace_subject"])
      .default("generate"),
    x: z.number().int().min(0).max(255).optional(),
    y: z.number().int().min(0).max(255).optional(),
    w: z.number().int().min(1).max(256).optional(),
    h: z.number().int().min(1).max(256).optional(),
    layer: z.string().optional(),
  },
  async ({ prompt, operation, x, y, w, h, layer }) => {
    const hasSelection =
      typeof x === "number" &&
      typeof y === "number" &&
      typeof w === "number" &&
      typeof h === "number";
    const result = await runAiTool(prompt, operation as AiOperation, {
      selection: hasSelection ? { x, y, w: w - 1, h: h - 1 } : null,
      layer,
    });
    const frame =
      result.project.frames.find(
        (item) => item.id === result.project.activeFrameId,
      ) || result.project.frames[0];
    const preview = encodePngRgba(
      SIZE,
      SIZE,
      compositeFrameRgba(frame, result.project.background),
    ).toString("base64");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              provider: result.provider,
              providerKind: result.providerKind,
              model: result.model,
              previewPngBase64: preview,
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
  "edit_pixel_art",
  "Edita o projeto atual com instrução em linguagem natural.",
  { prompt: z.string(), layer: z.string().optional() },
  async ({ prompt, layer }) => {
    const result = await runAiTool(prompt, "edit", { layer });
    project = result.project;
    save("project.change", {
      operation: "edit_pixel_art",
      prompt,
      layer,
      provider: result.provider,
      providerKind: result.providerKind,
      model: result.model,
    });
    return ok(`Edição aplicada via ${result.provider}.`);
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
    const result = await runAiTool(prompt, "edit_selection", {
      selection: { x, y, w: w - 1, h: h - 1 },
      layer,
    });
    project = result.project;
    save("project.change", {
      operation: "edit_selection",
      prompt,
      x,
      y,
      w,
      h,
      layer,
      provider: result.provider,
      providerKind: result.providerKind,
      model: result.model,
    });
    return ok(`Seleção editada via ${result.provider}.`);
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
    const result = await runAiTool(prompt, "replace_subject", {
      selection: { x, y, w: w - 1, h: h - 1 },
      layer,
    });
    project = result.project;
    save("project.change", {
      operation: "replace_subject",
      prompt,
      x,
      y,
      w,
      h,
      layer,
      provider: result.provider,
      providerKind: result.providerKind,
      model: result.model,
    });
    return ok(`Objeto/sujeito substituído via ${result.provider}.`);
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
    return ok(
      `Objeto centralizado em preview. Bounds: ${JSON.stringify(objectBounds(project))}`,
    );
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
              spritesheet_png_base64: godotAssetSpritesheetBase64(),
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
    applySave("project.replace", { operation: "apply_project_json" });
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
