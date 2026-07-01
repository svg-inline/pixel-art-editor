import { normalizeExportProfiles, type ExportProfile } from "./schemas.ts";
export type { ExportProfile } from "./schemas.ts";

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
  /** Prevents every pixel mutation while keeping layer metadata editable. */
  locked: boolean;
  /** Preserves the existing opaque pixel footprint while colors are edited. */
  alphaLocked: boolean;
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
  /** Canonical per-frame duration. Falls back to the animation FPS. */
  durationMs: number;
  /** @deprecated Kept in sync for schema-v2 consumers. */
  duration: number;
  layers: Layer[];
  activeLayerId: string;
  pivot: Point;
  /** False when `pivot` is inherited from the animation default. */
  pivotOverride: boolean;
  /** Snapshot used to detect direct schema-v2 pivot mutations safely. */
  inheritedPivot: Point;
  /** All gameplay boxes, retained as the schema-v2 compatibility view. */
  hitboxes: Hitbox[];
  hurtboxes: Hitbox[];
  attackboxes: Hitbox[];
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
  /** Default origin inherited by frames without an explicit pivot. */
  pivot: Point;
  /** Distinguishes a configured origin from the legacy canvas-center fallback. */
  pivotExplicit: boolean;
  frames: Frame[];
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
  schemaVersion: 3;
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
export type Selection = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Absolute pixel indexes used by non-rectangular selections. */
  mask?: number[];
};
export type PixelSelectionClip = Selection & {
  pixels: PixelArray;
  /** Relative selection mask, parallel to pixels. */
  selected?: boolean[];
};
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
  if (typeof structuredClone === "function") return structuredClone(v);
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
    locked: false,
    alphaLocked: false,
    pixels: new Array(PIXEL_COUNT).fill(null),
  };
}
export function blankFrame(name = "Frame 1"): Frame {
  const layer = blankLayer("Base");
  return {
    id: uid(),
    name,
    durationMs: 100,
    duration: 100,
    layers: [layer],
    activeLayerId: layer.id,
    pivot: { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) },
    pivotOverride: false,
    inheritedPivot: { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) },
    hitboxes: [],
    hurtboxes: [],
    attackboxes: [],
  };
}

// ─── Normalization helpers (private) ─────────────────────────────────────────

function normalizePalette(input: any): string[] {
  return Array.isArray(input) && input.length
    ? [
        ...new Set(
          input
            .map((c: any) => normHex(c))
            .filter((c): c is string => c !== null),
        ),
      ]
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

function normalizePoint(input: any, fallback?: Point): Point {
  const fallbackX = fallback?.x ?? Math.floor(SIZE / 2);
  const fallbackY = fallback?.y ?? Math.floor(SIZE / 2);
  const rawX = Number(input?.x ?? fallbackX);
  const rawY = Number(input?.y ?? fallbackY);
  return {
    x: clamp(
      Math.round(Number.isFinite(rawX) ? rawX : fallbackX),
      0,
      SIZE - 1,
    ),
    y: clamp(
      Math.round(Number.isFinite(rawY) ? rawY : fallbackY),
      0,
      SIZE - 1,
    ),
  };
}

function normalizeBox(box: any, index: number, forcedKind?: BoxKind): Hitbox {
  const kind =
    forcedKind || normalizeBoxKind(box?.kind || box?.type || box?.name);
  return {
    id: box?.id || uid(),
    name: String(box?.name || `${kind} ${index + 1}`),
    kind,
    x: clamp(Math.round(Number(box?.x || 0)), 0, SIZE - 1),
    y: clamp(Math.round(Number(box?.y || 0)), 0, SIZE - 1),
    w: clamp(Math.round(Number(box?.w || 1)), 1, SIZE),
    h: clamp(Math.round(Number(box?.h || 1)), 1, SIZE),
  };
}

function normalizeFrame(
  frame: any,
  frameIndex: number,
  animationPivot?: Point,
  fallbackDuration = 100,
): Frame {
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
    locked: layer?.locked === true,
    alphaLocked: layer?.alphaLocked === true,
    pixels: expandPixels(layer?.pixels),
  }));
  const activeLayerId = normalizedLayers.some(
    (l: Layer) => l.id === frame?.activeLayerId,
  )
    ? frame.activeLayerId
    : normalizedLayers[0].id;
  const hasStoredOverride = frame?.pivotOverride === true;
  const inheritedPivot = normalizePoint(animationPivot);
  const previousInheritedPivot = frame?.inheritedPivot
    ? normalizePoint(frame.inheritedPivot)
    : undefined;
  const directLegacyPivotMutation =
    frame?.pivotOverride === false &&
    previousInheritedPivot !== undefined &&
    (frame?.pivot?.x !== previousInheritedPivot.x ||
      frame?.pivot?.y !== previousInheritedPivot.y);
  const isUnmarkedLegacyOverride =
    frame?.pivotOverride === undefined && Boolean(frame?.pivot || frame?.origin);
  const pivotOverride =
    hasStoredOverride || isUnmarkedLegacyOverride || directLegacyPivotMutation;
  const pivot = normalizePoint(
    pivotOverride ? frame?.pivot || frame?.origin : animationPivot,
    animationPivot,
  );
  const boxInputs = [
    ...(Array.isArray(frame?.hitboxes)
      ? frame.hitboxes.map((box: any) => [box])
      : []),
    ...(Array.isArray(frame?.hurtboxes)
      ? frame.hurtboxes.map((box: any) => [box, "hurtbox"])
      : []),
    ...(Array.isArray(frame?.attackboxes)
      ? frame.attackboxes.map((box: any) => [box, "attackbox"])
      : []),
  ] as [any, BoxKind?][];
  const seenBoxIds = new Set<string>();
  const hitboxes = boxInputs
    .map(([box, kind], index) => normalizeBox(box, index, kind))
    .filter((box) => {
      if (seenBoxIds.has(box.id)) return false;
      seenBoxIds.add(box.id);
      return true;
    });
  const rawDuration = Number(
    frame?.duration ?? frame?.durationMs ?? fallbackDuration,
  );
  const durationMs = clamp(
    // Prefer the legacy alias when both are present so schema-v2 callers that
    // mutate `duration` continue to work; normalized output re-syncs both.
    Math.round(Number.isFinite(rawDuration) ? rawDuration : fallbackDuration),
    1,
    5000,
  );
  return {
    id: frame?.id || uid(),
    name: String(frame?.name || `Frame ${frameIndex + 1}`),
    durationMs,
    duration: durationMs,
    layers: normalizedLayers,
    activeLayerId,
    pivot,
    pivotOverride,
    inheritedPivot,
    hitboxes,
    hurtboxes: hitboxes.filter((box) => box.kind === "hurtbox"),
    attackboxes: hitboxes.filter((box) => box.kind === "attackbox"),
  };
}

function normalizeAnimation(
  animation: any,
  animationIndex: number,
  fallbackGodot?: Partial<GodotMeta>,
): Animation {
  const fallbackDirection = normalizeDirection(fallbackGodot?.direction, "W");
  const direction = normalizeDirection(animation?.direction, fallbackDirection);
  const rawFps = Number(animation?.fps ?? fallbackGodot?.fps ?? 6);
  const fps = clamp(
    Math.round(Number.isFinite(rawFps) ? rawFps : 6),
    1,
    60,
  );
  const pivot = normalizePoint(animation?.pivot || animation?.origin);
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
    fps,
    loop: animation?.loop ?? fallbackGodot?.loop ?? true,
    pivot,
    pivotExplicit:
      animation?.pivotExplicit ?? Boolean(animation?.pivot || animation?.origin),
    frames: frames.map((frame: any, index: number) =>
      normalizeFrame(frame, index, pivot, Math.round(1000 / fps)),
    ),
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
    exportProfiles: normalizeExportProfiles(asset?.exportProfiles),
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
        durationMs: 100,
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
  p.schemaVersion = 3;
  p.background = normalizeBackground(p.background);
  p.quality = p.quality || {};
  return p as Project;
}

export const normalizeProject = expandProject;
/** Explicit migration entry point for legacy layer, schema-v1 and schema-v2 projects. */
export const migrateProject = expandProject;

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
