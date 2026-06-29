import {
  clamp,
  expandPixels,
  expandProject,
  indexOf,
  PIXEL_COUNT,
  SIZE,
  type PixelArray,
  type Pixel,
  type PixelSelectionClip,
  type Frame,
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
  return {
    x: x1,
    y: y1,
    w: x2 - x1 + 1,
    h: y2 - y1 + 1,
    ...(sel.mask ? { mask: sel.mask } : {}),
  };
}

export function selectionContains(
  selection: Selection | null | undefined,
  x: number,
  y: number,
) {
  if (!selection) return false;
  if (selection.mask) return selection.mask.includes(indexOf(x, y));
  const bounds = selectionBounds(selection);
  return Boolean(
    bounds &&
      x >= bounds.x &&
      y >= bounds.y &&
      x < bounds.x + bounds.w &&
      y < bounds.y + bounds.h,
  );
}

export function selectionFromIndexes(indexes: Iterable<number>): Selection | null {
  const unique = [...new Set(indexes)].filter(
    (value) => Number.isInteger(value) && value >= 0 && value < PIXEL_COUNT,
  );
  if (!unique.length) return null;
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;
  for (const pixelIndex of unique) {
    const x = pixelIndex % SIZE;
    const y = Math.floor(pixelIndex / SIZE);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    mask: unique.sort((a, b) => a - b),
  };
}

/** Selects either the contiguous color island or every matching color. */
export function magicWandSelection(
  pixelsInput: PixelArray,
  x: number,
  y: number,
  contiguous = true,
) {
  const pixels = expandPixels(pixelsInput);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const target = pixels[indexOf(x, y)] ?? null;
  if (!contiguous) {
    const matches: number[] = [];
    for (let index = 0; index < pixels.length; index++)
      if ((pixels[index] ?? null) === target) matches.push(index);
    return selectionFromIndexes(matches);
  }
  const start = indexOf(x, y);
  const visited = new Uint8Array(PIXEL_COUNT);
  const queue = new Int32Array(PIXEL_COUNT);
  const matches: number[] = [];
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  while (head < tail) {
    const current = queue[head++];
    if ((pixels[current] ?? null) !== target) continue;
    matches.push(current);
    const cx = current % SIZE;
    const cy = Math.floor(current / SIZE);
    const neighbours = [
      cx > 0 ? current - 1 : -1,
      cx + 1 < SIZE ? current + 1 : -1,
      cy > 0 ? current - SIZE : -1,
      cy + 1 < SIZE ? current + SIZE : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      if ((pixels[neighbour] ?? null) === target) queue[tail++] = neighbour;
    }
  }
  return selectionFromIndexes(matches);
}

function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 0.0001) return false;
  return (
    px >= Math.min(ax, bx) &&
    px <= Math.max(ax, bx) &&
    py >= Math.min(ay, by) &&
    py <= Math.max(ay, by)
  );
}

/** Creates a pixel-precise selection from a freehand polygon. */
export function lassoSelection(points: { x: number; y: number }[]) {
  if (points.length < 3) return null;
  const minX = clamp(Math.floor(Math.min(...points.map((point) => point.x))), 0, SIZE - 1);
  const maxX = clamp(Math.ceil(Math.max(...points.map((point) => point.x))), 0, SIZE - 1);
  const minY = clamp(Math.floor(Math.min(...points.map((point) => point.y))), 0, SIZE - 1);
  const maxY = clamp(Math.ceil(Math.max(...points.map((point) => point.y))), 0, SIZE - 1);
  const selected: number[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if (pointOnSegment(px, py, a.x, a.y, b.x, b.y)) {
          inside = true;
          break;
        }
        const intersects =
          a.y > py !== b.y > py &&
          px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || 1) + a.x;
        if (intersects) inside = !inside;
      }
      if (inside) selected.push(indexOf(x, y));
    }
  return selectionFromIndexes(selected);
}

export function rotate90Selection(
  clip: PixelSelectionClip,
): PixelSelectionClip {
  const w = clip.h;
  const h = clip.w;
  const pixels: PixelArray = new Array(clip.pixels.length).fill(null);
  const selected = clip.selected
    ? new Array<boolean>(clip.selected.length).fill(false)
    : undefined;
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const src = clip.pixels[y * clip.w + x];
      pixels[x * w + (w - 1 - y)] = src;
      if (selected)
        selected[x * w + (w - 1 - y)] = Boolean(
          clip.selected?.[y * clip.w + x],
        );
    }
  return { ...clip, w, h, pixels, selected };
}

export function frameContentBounds(frame: Frame): Selection | null {
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    const pixels = expandPixels(layer.pixels);
    for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex++) {
      if (!pixels[pixelIndex]) continue;
      const x = pixelIndex % SIZE;
      const y = Math.floor(pixelIndex / SIZE);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Nearest-neighbour content resize, centered inside the fixed 256px canvas. */
export function resizeFrameContent(
  frame: Frame,
  width: number,
  height: number,
) {
  const bounds = frameContentBounds(frame);
  if (!bounds) return false;
  const targetWidth = clamp(
    Math.round(Number.isFinite(width) ? width : bounds.w),
    1,
    SIZE,
  );
  const targetHeight = clamp(
    Math.round(Number.isFinite(height) ? height : bounds.h),
    1,
    SIZE,
  );
  const targetX = Math.floor((SIZE - targetWidth) / 2);
  const targetY = Math.floor((SIZE - targetHeight) / 2);
  let changed = false;
  for (const layer of frame.layers) {
    if (layer.locked || layer.alphaLocked) continue;
    const source = expandPixels(layer.pixels);
    const next = new Array<Pixel>(PIXEL_COUNT).fill(null);
    for (let y = 0; y < targetHeight; y++)
      for (let x = 0; x < targetWidth; x++) {
        const sourceX = bounds.x + Math.min(bounds.w - 1, Math.floor((x * bounds.w) / targetWidth));
        const sourceY = bounds.y + Math.min(bounds.h - 1, Math.floor((y * bounds.h) / targetHeight));
        next[indexOf(targetX + x, targetY + y)] = source[indexOf(sourceX, sourceY)];
      }
    layer.pixels = next;
    changed = true;
  }
  if (changed)
    frame.pivot = {
      x: clamp(
        targetX + Math.round(((frame.pivot.x - bounds.x) * targetWidth) / bounds.w),
        0,
        SIZE - 1,
      ),
      y: clamp(
        targetY + Math.round(((frame.pivot.y - bounds.y) * targetHeight) / bounds.h),
        0,
        SIZE - 1,
      ),
    };
  return changed;
}

export function cropFrameToBounds(frame: Frame) {
  const bounds = frameContentBounds(frame);
  return bounds ? resizeFrameContent(frame, bounds.w, bounds.h) : false;
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
      if (layer.locked || layer.alphaLocked) continue;
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
      if (layer.locked || layer.alphaLocked) continue;
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
