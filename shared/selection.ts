import {
  clamp,
  expandPixels,
  expandProject,
  indexOf,
  PIXEL_COUNT,
  SIZE,
  type PixelArray,
  type PixelSelectionClip,
  type Project,
  type Selection,
} from "./model.ts";
import { qualityReport, objectBounds } from "./qa.ts";

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

export function rotate90Selection(
  clip: PixelSelectionClip,
): PixelSelectionClip {
  const w = clip.h;
  const h = clip.w;
  const pixels: PixelArray = new Array(clip.pixels.length).fill(null);
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const src = clip.pixels[y * clip.w + x];
      pixels[x * w + (w - 1 - y)] = src;
    }
  return { ...clip, w, h, pixels };
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
