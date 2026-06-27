// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

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
export type Point = { x: number; y: number };
export type BoxKind = "hitbox" | "hurtbox" | "attackbox";
export type Hitbox = Selection & {
  id: string;
  name: string;
  kind: BoxKind;
};
export type Frame = {
  id: string;
  name: string;
  duration: number;
  layers: Layer[];
  activeLayerId: string;
  pivot: Point;
  hitboxes: Hitbox[];
};
export type GodotMeta = {
  asset: string;
  animation: string;
  direction: Direction;
  fps: number;
  loop: boolean;
};
export type Animation = {
  id: string;
  name: string;
  direction: Direction;
  fps: number;
  loop: boolean;
  frames: Frame[];
};
export type ExportProfile = {
  id: string;
  name: string;
  engine: "godot" | "unity" | "generic";
  pixelsPerUnit?: number;
};
export type Asset = {
  id: string;
  name: string;
  palette: string[];
  animations: Animation[];
  exportProfiles: ExportProfile[];
};
export type BackgroundMode = "transparent" | "color";
export type ProjectBackground = {
  mode: BackgroundMode;
  color: string;
};
export type Project = {
  schemaVersion: 2;
  size: number;
  revision: number;
  assets: Asset[];
  activeAssetId: string;
  activeAnimationId: string;
  frames: Frame[];
  activeFrameId: string;
  palette: string[];
  godot: GodotMeta;
  background: ProjectBackground;
  quality?: Record<string, unknown>;
};
export type Selection = { x: number; y: number; w: number; h: number };
export type PixelSelectionClip = Selection & { pixels: PixelArray };
export type ToolResult = { project: Project; message: string };

// ─── Pure utilities ───────────────────────────────────────────────────────────

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

// ─── Pixel data (de/serialization) ───────────────────────────────────────────

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

// ─── Frame / layer factories ──────────────────────────────────────────────────

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
    pivot: { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) },
    hitboxes: [],
  };
}

// ─── Normalization helpers (private) ─────────────────────────────────────────

function normalizePalette(input: any) {
  return Array.isArray(input) && input.length
    ? [...new Set(input.map((c: any) => normHex(c)).filter(Boolean))]
    : DEFAULT_PALETTE;
}

function normalizeDirection(input: any, fallback: Direction = "W"): Direction {
  return (DIRECTIONS as readonly string[]).includes(String(input || ""))
    ? (String(input) as Direction)
    : fallback;
}

export function normalizeBoxKind(input: any): BoxKind {
  const value = String(input || "").toLowerCase();
  if (value.includes("hurt")) return "hurtbox";
  if (value.includes("attack")) return "attackbox";
  return "hitbox";
}

function normalizeFrame(frame: any, frameIndex: number): Frame {
  const layers =
    Array.isArray(frame?.layers) && frame.layers.length
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
    (l: Layer) => l.id === frame?.activeLayerId,
  )
    ? frame.activeLayerId
    : normalizedLayers[0].id;
  const pivot = {
    x: clamp(
      Math.round(Number(frame?.pivot?.x ?? Math.floor(SIZE / 2))),
      0,
      SIZE - 1,
    ),
    y: clamp(
      Math.round(Number(frame?.pivot?.y ?? Math.floor(SIZE / 2))),
      0,
      SIZE - 1,
    ),
  };
  const hitboxes = Array.isArray(frame?.hitboxes)
    ? frame.hitboxes.map((hitbox: any, hitboxIndex: number) => ({
        id: hitbox?.id || uid(),
        name: String(hitbox?.name || `Hitbox ${hitboxIndex + 1}`),
        kind: normalizeBoxKind(hitbox?.kind || hitbox?.type || hitbox?.name),
        x: clamp(Math.round(Number(hitbox?.x || 0)), 0, SIZE - 1),
        y: clamp(Math.round(Number(hitbox?.y || 0)), 0, SIZE - 1),
        w: clamp(Math.round(Number(hitbox?.w || 1)), 1, SIZE),
        h: clamp(Math.round(Number(hitbox?.h || 1)), 1, SIZE),
      }))
    : [];
  return {
    id: frame?.id || uid(),
    name: String(frame?.name || `Frame ${frameIndex + 1}`),
    duration: clamp(Math.round(Number(frame?.duration || 100)), 1, 5000),
    layers: normalizedLayers,
    activeLayerId,
    pivot,
    hitboxes,
  };
}

function normalizeAnimation(
  animation: any,
  animationIndex: number,
  fallbackGodot?: Partial<GodotMeta>,
): Animation {
  const fallbackDirection = normalizeDirection(fallbackGodot?.direction, "W");
  const direction = normalizeDirection(animation?.direction, fallbackDirection);
  const frames =
    Array.isArray(animation?.frames) && animation.frames.length
      ? animation.frames
      : [blankFrame()];
  return {
    id: animation?.id || uid(),
    name: String(
      animation?.name ||
        fallbackGodot?.animation ||
        `animation_${animationIndex + 1}`,
    ),
    direction,
    fps: clamp(
      Math.round(Number(animation?.fps ?? fallbackGodot?.fps ?? 6)),
      1,
      60,
    ),
    loop: animation?.loop ?? fallbackGodot?.loop ?? true,
    frames: frames.map(normalizeFrame),
  };
}

function normalizeAsset(
  asset: any,
  assetIndex: number,
  fallbackGodot?: GodotMeta,
): Asset {
  const animations =
    Array.isArray(asset?.animations) && asset.animations.length
      ? asset.animations
      : [
          {
            name: fallbackGodot?.animation || "idle_w",
            direction: fallbackGodot?.direction || "W",
            fps: fallbackGodot?.fps || 6,
            loop: fallbackGodot?.loop !== false,
            frames: Array.isArray(asset?.frames) ? asset.frames : undefined,
          },
        ];
  return {
    id: asset?.id || uid(),
    name: String(
      asset?.name || fallbackGodot?.asset || `Asset ${assetIndex + 1}`,
    ),
    palette: normalizePalette(asset?.palette),
    animations: animations.map((animation: any, i: number) =>
      normalizeAnimation(animation, i, fallbackGodot),
    ),
    exportProfiles:
      Array.isArray(asset?.exportProfiles) && asset.exportProfiles.length
        ? asset.exportProfiles.map((profile: any, profileIndex: number) => ({
            id: profile?.id || uid(),
            name: String(profile?.name || `Profile ${profileIndex + 1}`),
            engine:
              profile?.engine === "unity" || profile?.engine === "generic"
                ? profile.engine
                : "godot",
            pixelsPerUnit: Number.isFinite(Number(profile?.pixelsPerUnit))
              ? Number(profile.pixelsPerUnit)
              : SIZE,
          }))
        : [{ id: uid(), name: "Godot", engine: "godot", pixelsPerUnit: SIZE }],
  };
}

// ─── Project normalization ────────────────────────────────────────────────────

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
  const g = p.godot || {};
  const direction = normalizeDirection(g.direction, "W");
  p.godot = {
    asset: String(g.asset || "pixel_asset"),
    animation: String(g.animation || `idle_${direction.toLowerCase()}`),
    direction,
    fps: clamp(Math.round(Number(g.fps || 6)), 1, 60),
    loop: g.loop !== false,
  } satisfies GodotMeta;
  p.palette = normalizePalette(p.palette);
  const assetsSource =
    Array.isArray(p.assets) && p.assets.length
      ? p.assets
      : [
          {
            id: p.assetId,
            name: p.godot.asset,
            palette: p.palette,
            animations: [
              {
                id: p.animationId,
                name: p.godot.animation,
                direction: p.godot.direction,
                fps: p.godot.fps,
                loop: p.godot.loop,
                frames: p.frames,
              },
            ],
          },
        ];
  p.assets = assetsSource.map((asset: any, i: number) =>
    normalizeAsset(asset, i, p.godot),
  );
  const activeAsset =
    p.assets.find((a: Asset) => a.id === p.activeAssetId) || p.assets[0];
  p.activeAssetId = activeAsset.id;
  const activeAnimation =
    activeAsset.animations.find(
      (a: Animation) => a.id === p.activeAnimationId,
    ) ||
    activeAsset.animations.find(
      (a: Animation) => a.name === p.godot.animation,
    ) ||
    activeAsset.animations[0];
  p.activeAnimationId = activeAnimation.id;
  p.frames = activeAnimation.frames;
  p.activeFrameId = p.frames.some((f: Frame) => f.id === p.activeFrameId)
    ? p.activeFrameId
    : p.frames[0].id;
  p.palette = activeAsset.palette.length ? activeAsset.palette : p.palette;
  p.godot = {
    asset: activeAsset.name,
    animation: activeAnimation.name,
    direction: activeAnimation.direction,
    fps: activeAnimation.fps,
    loop: activeAnimation.loop,
  } satisfies GodotMeta;
  p.schemaVersion = 2;
  p.background = normalizeBackground(p.background);
  p.quality = p.quality || {};
  return p as Project;
}

export const normalizeProject = expandProject;

export function compactProject(input: any) {
  const p = expandProject(input) as any;
  const project = clone(p);
  const compactFrame = (frame: any) => {
    for (const layer of frame.layers)
      layer.pixels = compactPixels(layer.pixels);
  };
  for (const asset of project.assets || [])
    for (const animation of asset.animations || [])
      for (const frame of animation.frames || []) compactFrame(frame);
  project.frames =
    project.assets
      ?.find((asset: Asset) => asset.id === project.activeAssetId)
      ?.animations?.find(
        (animation: Animation) => animation.id === project.activeAnimationId,
      )?.frames || project.frames;
  return { format: "pixel-art-compact-v1", version: 1, project };
}
