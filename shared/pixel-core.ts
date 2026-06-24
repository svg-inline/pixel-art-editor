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
export type Project = {
  size: number;
  frames: Frame[];
  activeFrameId: string;
  palette: string[];
  godot: GodotMeta;
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
  color: string,
) {
  const c = normHex(color);
  if (!c) return;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPixel(layer, xx, yy, c);
}
export function drawEllipse(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  const c = normHex(color);
  if (!c) return;
  rx = Math.max(1, Math.round(rx));
  ry = Math.max(1, Math.round(ry));
  for (let yy = -ry; yy <= ry; yy++)
    for (let xx = -rx; xx <= rx; xx++) {
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1)
        setPixel(layer, x + xx, y + yy, c);
    }
}
export function drawLine(
  layer: Layer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  const c = normHex(color);
  if (!c) return;
  let dx = Math.abs(x2 - x1),
    sx = x1 < x2 ? 1 : -1,
    dy = -Math.abs(y2 - y1),
    sy = y1 < y2 ? 1 : -1,
    err = dx + dy;
  while (true) {
    setPixel(layer, x1, y1, c);
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
  return {
    colors: used.length,
    maxColors,
    overLimit: used.length > maxColors,
    falseCheckerboardPixels: countFalseCheckerboard(project),
    hasFullOpaqueLayer,
    transparentOk: !hasFullOpaqueLayer,
    frames: project.frames.length,
    layers: project.frames.reduce((sum, frame) => sum + frame.layers.length, 0),
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

export function generatePixelArtFromPrompt(
  prompt: string,
  baseProject?: any,
): Project {
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

export function compositeFrameRgba(frame: Frame) {
  const rgba = new Uint8Array(PIXEL_COUNT * 4);
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
