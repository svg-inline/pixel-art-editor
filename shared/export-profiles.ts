import { activeAnimationOf, activeAssetOf } from "./animation.ts";
import { expandProject, SIZE, type Frame, type Hitbox, type Point, type Project, type ProjectBackground } from "./model.ts";
import { compositeFrameRgba } from "./render.ts";
import {
  ExportProfileSchema,
  type ExportPresetId,
  type ExportProfile,
} from "./schemas.ts";

export type ExportRect = { x: number; y: number; w: number; h: number };
export type SpritesheetPlanFrame = {
  animationId: string;
  animationName: string;
  direction: string;
  frame: Frame;
  frameIndex: number;
  row: number;
  column: number;
  source: ExportRect;
  destination: ExportRect;
  sourceSize: { w: number; h: number };
  trimmed: boolean;
  scale: number;
};

export type SpritesheetPlan = {
  profile: ExportProfile;
  background: ProjectBackground;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: SpritesheetPlanFrame[];
};

export function exportProfileOf(projectInput: unknown, selector: ExportPresetId | string) {
  const project = expandProject(projectInput);
  const profiles = activeAssetOf(project).exportProfiles;
  return profiles.find((profile) => profile.preset === selector || profile.id === selector) || profiles[0];
}

export function resolveProfileBackground(project: Project, profile: ExportProfile): ProjectBackground {
  if (profile.background.mode === "project") return project.background;
  return profile.background.mode === "color"
    ? { mode: "color", color: profile.background.color }
    : { mode: "transparent", color: profile.background.color };
}

function intersectCrop(crop: ExportRect | null): ExportRect {
  if (!crop) return { x: 0, y: 0, w: SIZE, h: SIZE };
  const x = Math.max(0, Math.min(SIZE - 1, crop.x));
  const y = Math.max(0, Math.min(SIZE - 1, crop.y));
  return {
    x,
    y,
    w: Math.max(1, Math.min(crop.w, SIZE - x)),
    h: Math.max(1, Math.min(crop.h, SIZE - y)),
  };
}

function trimmedRect(frame: Frame, background: ProjectBackground, crop: ExportRect, trim: boolean) {
  if (!trim || background.mode === "color") return crop;
  const rgba = compositeFrameRgba(frame, background);
  let minX = crop.x + crop.w, minY = crop.y + crop.h, maxX = -1, maxY = -1;
  for (let y = crop.y; y < crop.y + crop.h; y++)
    for (let x = crop.x; x < crop.x + crop.w; x++)
      if (rgba[(y * SIZE + x) * 4 + 3]) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
  return maxX < minX
    ? { x: crop.x, y: crop.y, w: 1, h: 1 }
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Canonical geometry consumed by the PNG renderer and every metadata adapter. */
export function spritesheetPlan(projectInput: unknown, profileInput: ExportProfile | ExportPresetId | string): SpritesheetPlan {
  const project = expandProject(projectInput);
  const profile = typeof profileInput === "string"
    ? exportProfileOf(project, profileInput)
    : ExportProfileSchema.parse(profileInput);
  const asset = activeAssetOf(project);
  const active = activeAnimationOf(project);
  const allowed = new Set(profile.directions);
  const animations = (profile.scope === "all_animations" ? asset.animations : [active])
    .filter((animation) => !allowed.size || allowed.has(animation.direction));
  const background = resolveProfileBackground(project, profile);
  const crop = intersectCrop(profile.crop);
  const raw = animations.flatMap((animation, row) =>
    animation.frames.map((frame, column) => ({
      animation, row, column, frame,
      source: trimmedRect(frame, background, crop, profile.trim),
    })),
  );
  const columns = Math.max(0, ...animations.map((animation) => animation.frames.length));
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(1, ...raw.filter((item) => item.column === column).map((item) => item.source.w * profile.scale)),
  );
  const rowHeights = animations.map((_, row) =>
    Math.max(1, ...raw.filter((item) => item.row === row).map((item) => item.source.h * profile.scale)),
  );
  const xOffsets = columnWidths.map((_, index) =>
    profile.padding + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0) + index * profile.spacing,
  );
  const yOffsets = rowHeights.map((_, index) =>
    profile.padding + rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0) + index * profile.spacing,
  );
  return {
    profile,
    background,
    width: profile.padding * 2 + columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * profile.spacing,
    height: profile.padding * 2 + rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, animations.length - 1) * profile.spacing,
    columns,
    rows: animations.length,
    frames: raw.map(({ animation, row, column, frame, source }) => ({
      animationId: animation.id,
      animationName: animation.name,
      direction: animation.direction,
      frame,
      frameIndex: column,
      row,
      column,
      source,
      destination: {
        x: xOffsets[column], y: yOffsets[row],
        w: source.w * profile.scale, h: source.h * profile.scale,
      },
      sourceSize: { w: SIZE, h: SIZE },
      trimmed: source.x !== crop.x || source.y !== crop.y || source.w !== crop.w || source.h !== crop.h,
      scale: profile.scale,
    })),
  };
}

/** Integer-only nearest-neighbor scaler used outside the browser and by tests. */
export function scaleRgbaNearest(rgba: Uint8Array, width: number, height: number, scale: number) {
  const factor = Math.max(1, Math.floor(scale));
  const output = new Uint8Array(width * factor * height * factor * 4);
  const outputWidth = width * factor;
  for (let y = 0; y < height * factor; y++)
    for (let x = 0; x < width * factor; x++) {
      const source = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 4;
      const target = (y * outputWidth + x) * 4;
      output.set(rgba.subarray(source, source + 4), target);
    }
  return output;
}

export function pointInExportedFrame(point: Point, placement: SpritesheetPlanFrame) {
  return {
    x: (point.x - placement.source.x) * placement.scale,
    y: (point.y - placement.source.y) * placement.scale,
  };
}

export function boxInExportedFrame(box: Hitbox, placement: SpritesheetPlanFrame) {
  return {
    ...box,
    x: (box.x - placement.source.x) * placement.scale,
    y: (box.y - placement.source.y) * placement.scale,
    w: box.w * placement.scale,
    h: box.h * placement.scale,
  };
}

export function validateExportProfile(projectInput: unknown, profileInput: ExportProfile | ExportPresetId | string) {
  const project = expandProject(projectInput);
  const profile = typeof profileInput === "string" ? exportProfileOf(project, profileInput) : profileInput;
  const parsed = ExportProfileSchema.safeParse(profile);
  const issues: string[] = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const plan = parsed.success ? spritesheetPlan(project, parsed.data) : null;
  if (plan && !plan.frames.length) issues.push("Nenhuma animação corresponde às direções selecionadas.");
  if (plan && (plan.width > 16384 || plan.height > 16384)) issues.push("Spritesheet excede o limite seguro de 16384 px.");
  return { valid: issues.length === 0, issues, profile: parsed.success ? parsed.data : null, plan };
}
