import {
  expandPixels,
  expandProject,
  SIZE,
  type Project,
  type Selection,
} from "./model.ts";
import { colorsUsed, countFalseCheckerboard } from "./palette.ts";

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

export function qualityReport(project: Project, maxColors = 32) {
  const used = colorsUsed(project);
  const hasFullOpaqueLayer = project.frames.some((frame) =>
    frame.layers.some((layer) => expandPixels(layer.pixels).every(Boolean)),
  );
  const bounds = objectBounds(project);
  const opaquePixels = bounds?.pixels || 0;
  const dominant = used[0] || null;
  const dominantShare =
    dominant && opaquePixels
      ? Number((dominant[1] / opaquePixels).toFixed(3))
      : 0;
  const warnings: string[] = [];
  if (!bounds) warnings.push("empty_canvas");
  if (used.length > maxColors) warnings.push("palette_over_limit");
  if (countFalseCheckerboard(project)) warnings.push("false_checkerboard_pixels");
  if (hasFullOpaqueLayer) warnings.push("opaque_background_layer");
  if (bounds) {
    if (bounds.w < 24 || bounds.h < 24) warnings.push("object_too_small");
    if (bounds.w > SIZE - 16 || bounds.h > SIZE - 16)
      warnings.push("object_too_large");
    if (
      Math.abs(bounds.centerOffsetX) > 14 ||
      Math.abs(bounds.centerOffsetY) > 14
    )
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
