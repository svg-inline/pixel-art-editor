export const SIZE = 256;
export const PIXEL_COUNT = SIZE * SIZE;
export const DEFAULT_PALETTE = [
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
  "#581c87",
  "#a855f7",
];
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Pixel = string | null;
export type PixelArray = Pixel[];
export type RlePixels = {
  encoding: "rle";
  size: number;
  runs: [number, Pixel][];
};
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  pixels: PixelArray | RlePixels;
};
export type Frame = {
  id: string;
  name: string;
  duration: number;
  layers: Layer[];
  activeLayerId: string;
};
export type GodotMeta = {
  asset: string;
  animation: string;
  direction: Direction;
  fps: number;
  loop: boolean;
};
export type BackgroundMode = "transparent" | "color";
export type ProjectBackground = {
  mode: BackgroundMode;
  color: string;
};
export type Project = {
  size: number;
  revision: number;
  frames: Frame[];
  activeFrameId: string;
  palette: string[];
  godot: GodotMeta;
  background: ProjectBackground;
  quality?: Record<string, unknown>;
};
export type Selection = { x: number; y: number; w: number; h: number };
export type ToolResult = { project: Project; message: string };

export function uid() {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export const indexOf = (x: number, y: number, size = SIZE) => y * size + x;
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const slug = (v: string) =>
  String(v || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";
export const isHex = (v: any): v is string =>
  /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
export const normHex = (v: any, fallback: Pixel = null): Pixel =>
  isHex(v) ? String(v).toLowerCase() : fallback;
export function normalizeBackground(input: any): ProjectBackground {
  return {
    mode: input?.mode === "color" ? "color" : "transparent",
    color: normHex(input?.color, "#0f172a") || "#0f172a",
  };
}
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function blankLayer(name = "Layer"): Layer {
  return {
    id: uid(),
    name,
    visible: true,
    opacity: 1,
    pixels: new Array(PIXEL_COUNT).fill(null),
  };
}
export function blankFrame(name = "Frame 1"): Frame {
  const layer = blankLayer("Base");
  return {
    id: uid(),
    name,
    duration: 100,
    layers: [layer],
    activeLayerId: layer.id,
  };
}

export function expandPixels(pixels: any): PixelArray {
  if (Array.isArray(pixels)) {
    if (pixels.length === PIXEL_COUNT) return pixels as PixelArray;
    const out = new Array(PIXEL_COUNT).fill(null);
    for (let i = 0; i < Math.min(PIXEL_COUNT, pixels.length); i++)
      out[i] = normHex(pixels[i]);
    return out;
  }
  if (pixels && pixels.encoding === "rle" && Array.isArray(pixels.runs)) {
    const out: PixelArray = [];
    for (const run of pixels.runs) {
      const count = clamp(Number(run?.[0] || 0), 0, PIXEL_COUNT);
      const color = normHex(run?.[1]);
      for (let i = 0; i < count && out.length < PIXEL_COUNT; i++)
        out.push(color);
    }
    while (out.length < PIXEL_COUNT) out.push(null);
    return out.slice(0, PIXEL_COUNT);
  }
  return new Array(PIXEL_COUNT).fill(null);
}

export function compactPixels(input: any): RlePixels {
  const pixels = expandPixels(input);
  const runs: [number, Pixel][] = [];
  let prev: Pixel = pixels[0] ?? null;
  let count = 0;
  for (const px of pixels) {
    const color = normHex(px);
    if (color === prev) count++;
    else {
      runs.push([count, prev]);
      prev = color;
      count = 1;
    }
  }
  if (count) runs.push([count, prev]);
  return { encoding: "rle", size: PIXEL_COUNT, runs };
}

export function expandProject(input: any): Project {
  const raw =
    input?.format === "pixel-art-compact-v1" && input.project
      ? input.project
      : input;
  const p: any = raw && typeof raw === "object" ? clone(raw) : {};
  p.size = SIZE;
  p.revision = Math.max(
    0,
    Math.floor(Number.isFinite(Number(p.revision)) ? Number(p.revision) : 0),
  );
  if (!Array.isArray(p.frames) || !p.frames.length) {
    const layers =
      Array.isArray(p.layers) && p.layers.length
        ? p.layers
        : [blankLayer("Base")];
    p.frames = [
      {
        id: uid(),
        name: "Frame 1",
        duration: 100,
        layers,
        activeLayerId: p.activeLayerId || layers[0].id,
      },
    ];
    delete p.layers;
  }
  p.frames = p.frames.map((frame: any, frameIndex: number) => {
    const layers =
      Array.isArray(frame.layers) && frame.layers.length
        ? frame.layers
        : [blankLayer("Base")];
    const normalizedLayers = layers.map((layer: any, layerIndex: number) => ({
      id: layer?.id || uid(),
      name: String(layer?.name || `Layer ${layerIndex + 1}`),
      visible: layer?.visible !== false,
      opacity: clamp(
        Number.isFinite(Number(layer?.opacity)) ? Number(layer.opacity) : 1,
        0,
        1,
      ),
      pixels: expandPixels(layer?.pixels),
    }));
    const activeLayerId = normalizedLayers.some(
      (l: Layer) => l.id === frame.activeLayerId,
    )
      ? frame.activeLayerId
      : normalizedLayers[0].id;
    return {
      id: frame.id || uid(),
      name: String(frame.name || `Frame ${frameIndex + 1}`),
      duration: clamp(Math.round(Number(frame.duration || 100)), 1, 5000),
      layers: normalizedLayers,
      activeLayerId,
    };
  });
  p.activeFrameId = p.frames.some((f: Frame) => f.id === p.activeFrameId)
    ? p.activeFrameId
    : p.frames[0].id;
  p.palette =
    Array.isArray(p.palette) && p.palette.length
      ? [...new Set(p.palette.map((c: any) => normHex(c)).filter(Boolean))]
      : DEFAULT_PALETTE;
  const g = p.godot || {};
  const direction = (DIRECTIONS as readonly string[]).includes(
    String(g.direction || "W"),
  )
    ? (String(g.direction || "W") as Direction)
    : "W";
  p.godot = {
    asset: String(g.asset || "pixel_asset"),
    animation: String(g.animation || `idle_${direction.toLowerCase()}`),
    direction,
    fps: clamp(Math.round(Number(g.fps || 6)), 1, 60),
    loop: g.loop !== false,
  } satisfies GodotMeta;
  p.background = normalizeBackground(p.background);
  p.quality = p.quality || {};
  return p as Project;
}
export const normalizeProject = expandProject;

export function compactProject(input: any) {
  const p = expandProject(input) as any;
  const project = clone(p);
  for (const frame of project.frames) {
    for (const layer of frame.layers) {
      layer.pixels = compactPixels(layer.pixels);
    }
  }
  return { format: "pixel-art-compact-v1", version: 1, project };
}

export function activeFrameOf(project: Project) {
  return (
    project.frames.find((f) => f.id === project.activeFrameId) ||
    project.frames[0]
  );
}
export function activeLayerOf(frame: Frame) {
  return (
    frame.layers.find((l) => l.id === frame.activeLayerId) || frame.layers[0]
  );
}
export function layerByName(frame: Frame, name?: string) {
  return name
    ? frame.layers.find((l) => l.id === name || l.name === name)
    : activeLayerOf(frame);
}
export function frameByName(project: Project, name?: string) {
  return name
    ? project.frames.find((f) => f.id === name || f.name === name)
    : activeFrameOf(project);
}

export function withPixels(layer: Layer): PixelArray {
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  return pixels;
}
export function setPixel(layer: Layer, x: number, y: number, color: Pixel) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  withPixels(layer)[indexOf(x, y)] = normHex(color);
}
export function drawRect(
  layer: Layer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Pixel,
) {
  const c = color === null ? null : normHex(color);
  if (color !== null && !c) return;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPixel(layer, xx, yy, c);
}
export function drawEllipse(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Pixel,
) {
  const c = color === null ? null : normHex(color);
  if (color !== null && !c) return;
  rx = Math.max(1, Math.round(rx));
  ry = Math.max(1, Math.round(ry));
  for (let yy = -ry; yy <= ry; yy++)
    for (let xx = -rx; xx <= rx; xx++) {
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1)
        setPixel(layer, x + xx, y + yy, c);
    }
}
export function drawCircle(
  layer: Layer,
  x: number,
  y: number,
  r: number,
  color: Pixel,
) {
  drawEllipse(layer, x, y, r, r, color);
}
export function drawEllipseOutline(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  thickness: number,
  color: Pixel,
) {
  const t = clamp(Math.round(thickness), 1, Math.max(rx, ry));
  drawEllipse(layer, x, y, rx, ry, color);
  if (rx > t && ry > t) drawEllipse(layer, x, y, rx - t, ry - t, null);
}
export function drawLine(
  layer: Layer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness = 1,
) {
  const c = normHex(color);
  if (!c) return;
  const t = clamp(Math.round(thickness), 1, 32);
  let dx = Math.abs(x2 - x1),
    sx = x1 < x2 ? 1 : -1,
    dy = -Math.abs(y2 - y1),
    sy = y1 < y2 ? 1 : -1,
    err = dx + dy;
  while (true) {
    drawRect(layer, x1 - Math.floor(t / 2), y1 - Math.floor(t / 2), t, t, c);
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
}
export function clearLayer(layer: Layer) {
  layer.pixels = new Array(PIXEL_COUNT).fill(null);
}

export function selectionBounds(sel?: Selection | null): Selection | null {
  if (!sel) return null;
  const ax = Math.round(sel.x),
    ay = Math.round(sel.y),
    bx = Math.round(sel.x + sel.w),
    by = Math.round(sel.y + sel.h);
  const x1 = clamp(Math.min(ax, bx), 0, SIZE - 1),
    y1 = clamp(Math.min(ay, by), 0, SIZE - 1);
  const x2 = clamp(Math.max(ax, bx), 0, SIZE - 1),
    y2 = clamp(Math.max(ay, by), 0, SIZE - 1);
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

export type ObjectBounds = Selection & {
  pixels: number;
  cx: number;
  cy: number;
  coverage: number;
  centerOffsetX: number;
  centerOffsetY: number;
};

export function objectBounds(projectInput: any): ObjectBounds | null {
  const project = expandProject(projectInput);
  let minX = SIZE,
    minY = SIZE,
    maxX = -1,
    maxY = -1,
    pixels = 0;
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      if (!layer.visible) continue;
      const layerPixels = expandPixels(layer.pixels);
      for (let i = 0; i < layerPixels.length; i++) {
        if (!layerPixels[i]) continue;
        const x = i % SIZE,
          y = Math.floor(i / SIZE);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixels++;
      }
    }
  if (!pixels) return null;
  const w = maxX - minX + 1,
    h = maxY - minY + 1;
  const cx = minX + (w - 1) / 2,
    cy = minY + (h - 1) / 2;
  return {
    x: minX,
    y: minY,
    w,
    h,
    pixels,
    cx,
    cy,
    coverage: pixels / (SIZE * SIZE),
    centerOffsetX: Math.round(cx - (SIZE - 1) / 2),
    centerOffsetY: Math.round(cy - (SIZE - 1) / 2),
  };
}

export function shiftProjectPixels(
  projectInput: any,
  dx: number,
  dy: number,
): Project {
  const project = expandProject(projectInput);
  const sx = clamp(Math.round(dx), -SIZE, SIZE);
  const sy = clamp(Math.round(dy), -SIZE, SIZE);
  if (!sx && !sy) return project;
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      const source = expandPixels(layer.pixels);
      const next = new Array(PIXEL_COUNT).fill(null);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const px = source[indexOf(x, y)];
          if (!px) continue;
          const tx = x + sx,
            ty = y + sy;
          if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
            next[indexOf(tx, ty)] = px;
        }
      layer.pixels = next;
    }
  project.quality = qualityReport(project, 32);
  return project;
}

export function centerObject(projectInput: any): Project {
  const project = expandProject(projectInput);
  const bounds = objectBounds(project);
  if (!bounds) return project;
  return shiftProjectPixels(
    project,
    Math.round((SIZE - 1) / 2 - bounds.cx),
    Math.round((SIZE - 1) / 2 - bounds.cy),
  );
}

export function colorsUsed(project: Project) {
  const map = new Map<string, number>();
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      for (const px of expandPixels(layer.pixels)) {
        if (px) map.set(px, (map.get(px) || 0) + 1);
      }
    }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
export function replaceGlobalColor(project: Project, from: string, to: string) {
  const a = normHex(from);
  const b = normHex(to);
  if (!a || !b) return project;
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      const pixels = withPixels(layer);
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i] === a) pixels[i] = b;
    }
  project.palette = [...new Set(project.palette.map((c) => (c === a ? b : c)))];
  return project;
}
export function limitColors(project: Project, maxColors = 32) {
  const used = colorsUsed(project);
  const allowed = used
    .slice(0, clamp(Math.round(maxColors), 2, 256))
    .map(([c]) => c);
  if (!allowed.length) return project;
  const fallback = allowed[0];
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      const pixels = withPixels(layer);
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i] && !allowed.includes(pixels[i] as string))
          pixels[i] = fallback;
    }
  project.palette = allowed;
  return project;
}
export function countFalseCheckerboard(project: Project) {
  const bad = new Set([
    "#dddddd",
    "#cccccc",
    "#ffffff",
    "#f5f5f5",
    "#eeeeee",
    "#999999",
    "#9ca3af",
  ]);
  let count = 0;
  for (const frame of project.frames)
    for (const layer of frame.layers)
      for (const px of expandPixels(layer.pixels))
        if (px && bad.has(px)) count++;
  return count;
}
export function qualityReport(project: Project, maxColors = 32) {
  const used = colorsUsed(project);
  const hasFullOpaqueLayer = project.frames.some((frame) =>
    frame.layers.some((layer) => expandPixels(layer.pixels).every(Boolean)),
  );
  const bounds = objectBounds(project);
  const opaquePixels = bounds?.pixels || 0;
  const dominant = used[0] || null;
  const dominantShare =
    dominant && opaquePixels ? Number((dominant[1] / opaquePixels).toFixed(3)) : 0;
  const warnings: string[] = [];
  if (!bounds) warnings.push("empty_canvas");
  if (used.length > maxColors) warnings.push("palette_over_limit");
  if (countFalseCheckerboard(project)) warnings.push("false_checkerboard_pixels");
  if (hasFullOpaqueLayer) warnings.push("opaque_background_layer");
  if (bounds) {
    if (bounds.w < 24 || bounds.h < 24) warnings.push("object_too_small");
    if (bounds.w > SIZE - 16 || bounds.h > SIZE - 16)
      warnings.push("object_too_large");
    if (Math.abs(bounds.centerOffsetX) > 14 || Math.abs(bounds.centerOffsetY) > 14)
      warnings.push("object_off_center");
    if (dominantShare > 0.72) warnings.push("dominant_color_too_strong");
  }
  return {
    colors: used.length,
    maxColors,
    overLimit: used.length > maxColors,
    falseCheckerboardPixels: countFalseCheckerboard(project),
    hasFullOpaqueLayer,
    transparentOk: !hasFullOpaqueLayer,
    frames: project.frames.length,
    layers: project.frames.reduce((sum, frame) => sum + frame.layers.length, 0),
    background: project.background,
    bounds,
    dominantColor: dominant
      ? { color: dominant[0], pixels: dominant[1], share: dominantShare }
      : null,
    warnings,
  };
}

function animationSpec(prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const direction: Direction =
    lower.includes("noroeste") || lower.includes("northwest")
      ? "NW"
      : lower.includes("nordeste") || lower.includes("northeast")
        ? "NE"
        : lower.includes("sudoeste") || lower.includes("southwest")
          ? "SW"
          : lower.includes("sudeste") || lower.includes("southeast")
            ? "SE"
            : lower.includes("oeste") ||
                lower.includes("west") ||
                /\bw\b/.test(lower)
              ? "W"
              : lower.includes("leste") ||
                  lower.includes("east") ||
                  /\be\b/.test(lower)
                ? "E"
                : lower.includes("norte") ||
                    lower.includes("north") ||
                    /\bn\b/.test(lower)
                  ? "N"
                  : "S";
  const kind = /morrer|death|dead/.test(lower)
    ? "death"
    : /skill|habilidade|magia|cast/.test(lower)
      ? "skill"
      : /esquiva|dodge|dash/.test(lower)
        ? "dodge"
        : /attack|ataque|golpe|hit/.test(lower)
          ? "attack"
          : /walk|andar|movimento|move|run|correr/.test(lower)
            ? "walk"
            : "idle";
  const frames =
    kind === "walk"
      ? 8
      : kind === "attack"
        ? 6
        : kind === "dodge"
          ? 5
          : kind === "skill"
            ? 8
            : kind === "death"
              ? 6
              : 4;
  const fps =
    kind === "attack"
      ? 10
      : kind === "walk"
        ? 8
        : kind === "dodge"
          ? 12
          : kind === "skill"
            ? 9
            : 6;
  return {
    kind,
    direction,
    frames,
    fps,
    animation: `${kind}_${direction.toLowerCase()}`,
  };
}

function paletteForPrompt(prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const base = {
    outline: "#111827",
    cloth: "#374151",
    leather: "#78350f",
    skin: "#d6a878",
    metal: "#9ca3af",
    shadow: "#1f2937",
    highlight: "#facc15",
    magic: "#7c3aed",
  };
  if (/valdren|costa|chuva|sombria|dark|feudal/.test(lower))
    return {
      ...base,
      cloth: "#334155",
      leather: "#713f12",
      metal: "#94a3b8",
      highlight: "#38bdf8",
    };
  if (/orc|monstro|bruto/.test(lower))
    return { ...base, skin: "#166534", cloth: "#3f3f46", highlight: "#84cc16" };
  if (/mago|arcano|magia/.test(lower))
    return {
      ...base,
      cloth: "#312e81",
      magic: "#a855f7",
      highlight: "#c084fc",
    };
  return base;
}

type ObjectKind = "key" | "coin" | "potion" | "sword" | "chest" | "gem";

function objectKindFromPrompt(prompt: string): ObjectKind | null {
  const lower = String(prompt || "").toLowerCase();
  if (/personagem|character|npc|her[oó]i|humano|humanoid/.test(lower))
    return null;
  if (/chave|key/.test(lower)) return "key";
  if (/moeda|coin|token|medalha/.test(lower)) return "coin";
  if (/po[cç][aã]o|potion|frasco|bottle|elixir/.test(lower)) return "potion";
  if (/espada|sword|l[âa]mina|blade/.test(lower)) return "sword";
  if (/ba[uú]|chest|caixa|crate/.test(lower)) return "chest";
  if (/gema|gem|cristal|crystal|joia|jewel/.test(lower)) return "gem";
  if (/objeto|object|item|asset|[ií]cone|icon|pickup|invent[aá]rio/.test(lower))
    return "gem";
  return null;
}

function objectPalette(prompt: string, kind: ObjectKind) {
  const lower = String(prompt || "").toLowerCase();
  if (/prata|silver|a[cç]o|steel|ferro|iron/.test(lower) || kind === "sword")
    return {
      outline: "#172033",
      base: "#94a3b8",
      mid: "#64748b",
      dark: "#334155",
      light: "#e2e8f0",
      accent: "#38bdf8",
    };
  if (/roxo|purple|arcano|magic|m[aá]gic/.test(lower) || kind === "gem")
    return {
      outline: "#241038",
      base: "#7e22ce",
      mid: "#9333ea",
      dark: "#4c1d95",
      light: "#d8b4fe",
      accent: "#22d3ee",
    };
  if (/verde|green|veneno|poison/.test(lower) || kind === "potion")
    return {
      outline: "#133022",
      base: "#16a34a",
      mid: "#22c55e",
      dark: "#166534",
      light: "#bbf7d0",
      accent: "#38bdf8",
    };
  if (kind === "chest")
    return {
      outline: "#2a1704",
      base: "#92400e",
      mid: "#b45309",
      dark: "#451a03",
      light: "#facc15",
      accent: "#fbbf24",
    };
  return {
    outline: "#3b2607",
    base: "#d97706",
    mid: "#f59e0b",
    dark: "#92400e",
    light: "#fde68a",
    accent: "#facc15",
  };
}

function objectAssetName(kind: ObjectKind, prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const material = /prata|silver/.test(lower)
    ? "silver"
    : /a[cç]o|steel|ferro|iron/.test(lower)
      ? "steel"
      : /roxo|purple|arcano|magic|m[aá]gic/.test(lower)
        ? "arcane"
        : /verde|green|veneno|poison/.test(lower)
          ? "green"
          : /dourad|ouro|gold/.test(lower)
            ? "golden"
            : "";
  return slug([material, kind].filter(Boolean).join("_"));
}

function drawDiamond(
  layer: Layer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: Pixel,
) {
  for (let yy = -ry; yy <= ry; yy++) {
    const half = Math.max(0, Math.round(rx * (1 - Math.abs(yy) / ry)));
    drawRect(layer, cx - half, cy + yy, half * 2 + 1, 1, color);
  }
}

function drawObjectTemplate(kind: ObjectKind, layers: Layer[], prompt: string) {
  const c = objectPalette(prompt, kind);
  const [outline, base, shadow, light] = layers;
  if (kind === "key") {
    drawEllipseOutline(outline, 80, 128, 39, 38, 8, c.outline);
    drawRect(outline, 113, 116, 87, 26, c.outline);
    drawRect(outline, 192, 128, 24, 18, c.outline);
    drawRect(outline, 203, 141, 16, 23, c.outline);
    drawRect(outline, 180, 141, 24, 17, c.outline);

    drawEllipseOutline(base, 80, 128, 30, 29, 13, c.mid);
    drawRect(base, 119, 123, 78, 14, c.mid);
    drawRect(base, 195, 131, 15, 12, c.mid);
    drawRect(base, 205, 143, 8, 14, c.base);
    drawRect(base, 183, 143, 15, 9, c.base);

    drawRect(shadow, 73, 148, 29, 8, c.dark);
    drawRect(shadow, 121, 135, 73, 5, c.dark);
    drawRect(shadow, 198, 153, 12, 7, c.dark);
    drawRect(light, 64, 101, 34, 6, c.light);
    drawRect(light, 119, 124, 56, 4, c.light);
    drawLine(light, 58, 133, 78, 112, c.light, 5);
    return;
  }

  if (kind === "coin") {
    drawEllipse(outline, 128, 128, 47, 53, c.outline);
    drawEllipse(base, 128, 128, 38, 44, c.mid);
    drawEllipse(shadow, 134, 138, 26, 31, c.dark);
    drawEllipse(base, 123, 121, 30, 37, c.base);
    drawEllipseOutline(light, 128, 128, 25, 31, 4, c.light);
    drawRect(light, 116, 91, 24, 6, c.light);
    return;
  }

  if (kind === "potion") {
    drawRect(outline, 108, 68, 40, 20, c.outline);
    drawRect(outline, 116, 86, 24, 25, c.outline);
    drawEllipse(outline, 128, 145, 49, 52, c.outline);
    drawRect(base, 114, 72, 28, 11, "#8b5cf6");
    drawRect(base, 121, 88, 14, 27, c.accent);
    drawEllipse(base, 128, 148, 39, 42, c.base);
    drawRect(shadow, 103, 150, 50, 29, c.dark);
    drawEllipse(light, 117, 128, 13, 18, c.light);
    drawRect(light, 120, 92, 10, 24, c.light);
    return;
  }

  if (kind === "sword") {
    drawLine(outline, 78, 180, 174, 84, c.outline, 17);
    drawLine(base, 84, 174, 169, 89, c.base, 9);
    drawLine(light, 91, 166, 164, 93, c.light, 3);
    drawRect(outline, 84, 169, 45, 12, c.outline);
    drawRect(base, 91, 171, 33, 7, c.accent);
    drawLine(outline, 71, 187, 102, 156, c.outline, 14);
    drawLine(shadow, 76, 182, 97, 161, c.dark, 8);
    drawEllipse(base, 70, 189, 10, 10, c.accent);
    return;
  }

  if (kind === "chest") {
    drawRect(outline, 72, 94, 112, 87, c.outline);
    drawRect(outline, 84, 74, 88, 30, c.outline);
    drawRect(base, 81, 105, 94, 66, c.base);
    drawRect(base, 92, 84, 72, 22, c.mid);
    drawRect(shadow, 81, 143, 94, 28, c.dark);
    drawRect(light, 88, 91, 66, 7, c.light);
    drawRect(outline, 123, 111, 15, 52, c.outline);
    drawRect(base, 126, 116, 9, 42, c.accent);
    drawRect(outline, 115, 127, 31, 25, c.outline);
    drawRect(light, 121, 131, 19, 14, c.light);
    return;
  }

  drawDiamond(outline, 128, 127, 47, 62, c.outline);
  drawDiamond(base, 128, 127, 36, 50, c.mid);
  drawDiamond(shadow, 135, 138, 24, 34, c.dark);
  drawDiamond(light, 117, 107, 17, 22, c.light);
  drawLine(light, 107, 130, 128, 77, c.accent, 4);
}

function generateObjectProject(
  prompt: string,
  baseProject: any,
  kind: ObjectKind,
): Project {
  const project = expandProject(baseProject || {});
  const frame = blankFrame(
    kind === "key"
      ? "Chave"
      : kind === "coin"
        ? "Moeda"
        : kind === "potion"
          ? "Pocao"
          : kind === "sword"
            ? "Espada"
            : kind === "chest"
              ? "Bau"
              : "Gema",
  );
  frame.duration = 160;
  frame.layers = [
    blankLayer("Contorno"),
    blankLayer("Base"),
    blankLayer("Sombra"),
    blankLayer("Brilho"),
  ];
  frame.activeLayerId = frame.layers[3].id;
  drawObjectTemplate(kind, frame.layers, prompt);
  project.frames = [frame];
  project.activeFrameId = frame.id;
  project.godot = {
    asset: objectAssetName(kind, prompt),
    animation: "idle",
    direction: "S",
    fps: 6,
    loop: true,
  };
  const centered = centerObject(project);
  centered.palette = colorsUsed(centered).map(([color]) => color);
  centered.quality = qualityReport(centered, 16);
  return expandProject(centered);
}

export function generatePixelArtFromPrompt(
  prompt: string,
  baseProject?: any,
): Project {
  const objectKind = objectKindFromPrompt(prompt);
  if (objectKind) return generateObjectProject(prompt, baseProject, objectKind);

  const spec = animationSpec(prompt);
  const project = expandProject(baseProject || {});
  project.frames = [];
  project.activeFrameId = "";
  project.godot = {
    ...project.godot,
    animation: spec.animation,
    direction: spec.direction,
    fps: spec.fps,
    loop: spec.kind !== "death",
  };
  const c = paletteForPrompt(prompt);
  for (let i = 0; i < spec.frames; i++) {
    const frame = blankFrame(`Frame ${i + 1}`);
    frame.duration = Math.round(1000 / spec.fps);
    frame.layers = [
      blankLayer("Silhueta"),
      blankLayer("Detalhes"),
      blankLayer("Sombra/Luz"),
    ];
    frame.activeLayerId = frame.layers[1].id;
    const body = frame.layers[0],
      detail = frame.layers[1],
      shade = frame.layers[2];
    const phase = (i / spec.frames) * Math.PI * 2;
    const bob =
      spec.kind === "idle"
        ? Math.round(Math.sin(phase) * 2)
        : Math.round(Math.sin(phase) * 3);
    const step = spec.kind === "walk" ? Math.round(Math.sin(phase) * 5) : 0;
    const swing =
      spec.kind === "attack" ? i * 4 : spec.kind === "dodge" ? i * 5 : 0;
    const lx = ["W", "NW", "SW"].includes(spec.direction) ? -1 : 1;
    const cx = 128 + (spec.kind === "dodge" ? lx * swing : 0);
    const cy = 128 + bob + (spec.kind === "death" ? i * 4 : 0);
    if (spec.kind === "death") {
      drawEllipse(body, cx, cy - 10, 22 + i * 2, 11, c.outline);
      drawRect(detail, cx - 24, cy - 12, 48, 13, c.cloth);
      drawRect(shade, cx - 20, cy, 40, 5, c.shadow);
    } else {
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
      if (spec.kind === "attack") {
        drawRect(
          detail,
          cx + lx * (28 + swing),
          cy - 24 - swing,
          35,
          5,
          c.metal,
        );
        drawRect(
          detail,
          cx + lx * (62 + swing),
          cy - 27 - swing,
          8,
          11,
          c.metal,
        );
      } else if (spec.kind === "skill") {
        drawEllipse(
          detail,
          cx + lx * (36 + Math.round(Math.sin(phase) * 4)),
          cy - 28,
          8 + (i % 3),
          8 + (i % 3),
          c.magic,
        );
        drawRect(detail, cx + lx * 30, cy - 30, 5, 45, c.metal);
      } else {
        drawRect(detail, cx + lx * 30, cy - 30, 5, 45, c.metal);
        drawRect(detail, cx + lx * 27, cy + 10, 12, 18, c.metal);
      }
    }
    project.frames.push(frame);
    if (!project.activeFrameId) project.activeFrameId = frame.id;
  }
  project.palette = [
    ...new Set([...Object.values(c), ...DEFAULT_PALETTE]),
  ].filter(Boolean);
  project.quality = qualityReport(project, 32);
  return expandProject(project);
}

export function editSelection(
  projectInput: any,
  prompt: string,
  selection?: Selection | null,
  layerName?: string,
): Project {
  const project = expandProject(projectInput);
  const frame = activeFrameOf(project);
  const layer = layerByName(frame, layerName);
  if (!layer) return project;
  const b = selectionBounds(selection) || { x: 88, y: 72, w: 80, h: 104 };
  const lower = String(prompt || "").toLowerCase();
  const c = paletteForPrompt(prompt);
  if (/limpar|clear|apagar/.test(lower)) {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) setPixel(layer, b.x + x, b.y + y, null);
  } else if (/sombra|shadow/.test(lower)) {
    for (let y = Math.floor(b.h * 0.6); y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        if ((x + y) % 2 === 0) setPixel(layer, b.x + x, b.y + y, c.shadow);
  } else if (/luz|highlight|brilho/.test(lower)) {
    for (let y = 0; y < Math.max(2, Math.floor(b.h * 0.2)); y++)
      for (let x = 0; x < b.w; x++)
        if ((x + y) % 3 === 0) setPixel(layer, b.x + x, b.y + y, c.highlight);
  } else if (/contorno|outline/.test(lower)) {
    drawRect(layer, b.x, b.y, b.w, 1, c.outline);
    drawRect(layer, b.x, b.y + b.h - 1, b.w, 1, c.outline);
    drawRect(layer, b.x, b.y, 1, b.h, c.outline);
    drawRect(layer, b.x + b.w - 1, b.y, 1, b.h, c.outline);
  } else {
    drawEllipse(
      layer,
      b.x + Math.floor(b.w / 2),
      b.y + Math.floor(b.h / 2),
      Math.max(2, Math.floor(b.w / 3)),
      Math.max(2, Math.floor(b.h / 3)),
      c.highlight,
    );
  }
  project.palette = [...new Set([...project.palette, ...Object.values(c)])];
  project.quality = qualityReport(project, 32);
  return project;
}

export function createVariation(
  projectInput: any,
  variant = "mirror_h",
): Project {
  const project = expandProject(projectInput);
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      const old = expandPixels(layer.pixels);
      const next = new Array(PIXEL_COUNT).fill(null);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const src = old[indexOf(x, y)];
          if (variant === "mirror_v") next[indexOf(x, SIZE - 1 - y)] = src;
          else if (variant === "shift_right")
            next[indexOf(clamp(x + 2, 0, SIZE - 1), y)] = src;
          else next[indexOf(SIZE - 1 - x, y)] = src;
        }
      layer.pixels = next;
    }
  return project;
}

export function extendAnimation(projectInput: any, totalFrames = 8): Project {
  const project = expandProject(projectInput);
  totalFrames = clamp(Math.round(totalFrames), 1, 64);
  while (project.frames.length < totalFrames) {
    const source = clone(
      project.frames[
        project.frames.length % Math.max(1, project.frames.length)
      ] || blankFrame(),
    );
    source.id = uid();
    source.name = `Frame ${project.frames.length + 1}`;
    source.layers.forEach((layer, i) => {
      layer.id = uid();
      if (i === 0) source.activeLayerId = layer.id;
    });
    project.frames.push(source);
  }
  project.quality = qualityReport(project, 32);
  return project;
}

export function godotMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  return {
    asset,
    engine: "godot",
    godot_version: "4.x",
    frame_width: SIZE,
    frame_height: SIZE,
    background: project.background,
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
      spriteframes: `res://assets/${asset}/${asset}.spriteframes.tres`,
    },
    animations: [
      {
        name: anim,
        direction: project.godot.direction,
        fps: project.godot.fps,
        loop: project.godot.loop,
        frames: project.frames.length,
        layout: "horizontal",
        frame_rects: project.frames.map((frame, i) => ({
          x: i * SIZE,
          y: 0,
          w: SIZE,
          h: SIZE,
          duration: frame.duration || Math.round(1000 / project.godot.fps),
        })),
      },
    ],
  };
}
export function atlasMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  return {
    meta: {
      image: `${asset}_${anim}_sheet.png`,
      size: { w: SIZE * project.frames.length, h: SIZE },
      scale: 1,
    },
    frames: Object.fromEntries(
      project.frames.map((frame, i) => [
        `${anim}_${String(i).padStart(2, "0")}`,
        {
          frame: { x: i * SIZE, y: 0, w: SIZE, h: SIZE },
          duration: frame.duration || Math.round(1000 / project.godot.fps),
        },
      ]),
    ),
  };
}
export function unityMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  return {
    asset,
    engine: "unity",
    background: project.background,
    pixelsPerUnit: SIZE,
    filterMode: "Point",
    compression: "None",
    spriteMode: "Multiple",
    sheet: `${asset}_${anim}_sheet.png`,
    frames: project.frames.map((_, i) => ({
      name: `${anim}_${i}`,
      x: i * SIZE,
      y: 0,
      width: SIZE,
      height: SIZE,
      pivot: { x: 0.5, y: 0.5 },
    })),
  };
}

export function compositeFrameRgba(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const rgba = new Uint8Array(PIXEL_COUNT * 4);
  const bg = normalizeBackground(background);
  if (bg.mode === "color") {
    const n = parseInt(bg.color.slice(1), 16);
    for (let i = 0; i < PIXEL_COUNT; i++) {
      const di = i * 4;
      rgba[di] = (n >> 16) & 255;
      rgba[di + 1] = (n >> 8) & 255;
      rgba[di + 2] = n & 255;
      rgba[di + 3] = 255;
    }
  }
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    const alpha = clamp(layer.opacity, 0, 1);
    const pixels = expandPixels(layer.pixels);
    for (let i = 0; i < pixels.length; i++) {
      const px = pixels[i];
      if (!px) continue;
      const n = parseInt(px.slice(1), 16);
      const srcA = alpha;
      const di = i * 4;
      const dstA = rgba[di + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      rgba[di] = Math.round(
        (((n >> 16) & 255) * srcA + rgba[di] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 1] = Math.round(
        (((n >> 8) & 255) * srcA + rgba[di + 1] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 2] = Math.round(
        ((n & 255) * srcA + rgba[di + 2] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 3] = Math.round(outA * 255);
    }
  }
  return rgba;
}
