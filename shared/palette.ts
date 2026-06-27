import { activeAssetOf } from "./animation.ts";
import { expandPixels, normHex, type Project } from "./model.ts";
import { withPixels } from "./raster.ts";

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
  activeAssetOf(project).palette = project.palette;
  return project;
}

export function limitColors(project: Project, maxColors = 32) {
  const used = colorsUsed(project);
  const allowed = used
    .slice(0, Math.max(2, Math.min(256, Math.round(maxColors))))
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
  activeAssetOf(project).palette = project.palette;
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
