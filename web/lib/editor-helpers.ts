import {
  clamp,
  clone,
  expandPixels,
  indexOf,
  isHex,
  selectionBounds,
  SIZE,
} from "../../shared/pixel-core.ts";
import type {
  Frame,
  Layer,
  Pixel,
  PixelArray,
  Project,
  ProjectBackground,
  Selection,
} from "../../shared/pixel-core.ts";
import type { Clip, GridDensity, Point, ShapeTool, Tool } from "../types.ts";

const idx = indexOf;

const GRID_DENSITY_TARGETS: Record<GridDensity, number> = {
  compacta: 14,
  normal: 26,
  limpa: 42,
};
const GRID_STEPS = [1, 2, 4, 8, 16, 32, 64];

export function gridStepForZoom(
  zoom: number,
  density: GridDensity = "normal",
) {
  const target = GRID_DENSITY_TARGETS[density] || GRID_DENSITY_TARGETS.normal;
  return GRID_STEPS.find((step) => step * zoom >= target) || 64;
}

export function cloneProject<T>(project: T): T {
  return clone(project);
}

export function activeFrameIndex(project: Project) {
  return Math.max(
    0,
    project.frames.findIndex((frame) => frame.id === project.activeFrameId),
  );
}

export function activeLayerIndexOf(frame: Frame) {
  return Math.max(
    0,
    frame.layers.findIndex((layer) => layer.id === frame.activeLayerId),
  );
}

export function floodFillFrame(
  frame: Frame,
  layerIndex: number,
  x: number,
  y: number,
  color: Pixel,
) {
  const layer = frame.layers[layerIndex];
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  const target = pixels[idx(x, y)];
  if (target === color) return;
  const q = [[x, y]];
  const visited = new Uint8Array(SIZE * SIZE);
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
    const i = idx(cx, cy);
    if (visited[i]) continue;
    visited[i] = 1;
    if (pixels[i] !== target) continue;
    pixels[i] = color;
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

export function fillBackground(
  ctx: CanvasRenderingContext2D,
  background: ProjectBackground,
  scale = 1,
) {
  if (background?.mode !== "color") return;
  ctx.fillStyle = isHex(background.color) ? background.color : "#0f172a";
  ctx.fillRect(0, 0, SIZE * scale, SIZE * scale);
}

export function downloadText(
  filename: string,
  text: string,
  type = "application/json",
) {
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export function downloadCanvas(filename: string, canvas: HTMLCanvasElement) {
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = canvas.toDataURL("image/png");
  anchor.click();
}

export function downloadBytes(
  filename: string,
  data: Uint8Array,
  type: string,
) {
  const anchor = document.createElement("a");
  const copy = new Uint8Array(data);
  anchor.download = filename;
  anchor.href = URL.createObjectURL(new Blob([copy.buffer], { type }));
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function canvasBlob(canvas: HTMLCanvasElement, type = "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("blob_failed"))),
      type,
    );
  });
}

export async function canvasBytes(
  canvas: HTMLCanvasElement,
  type = "image/png",
) {
  return new Uint8Array(await (await canvasBlob(canvas, type)).arrayBuffer());
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((text) => JSON.parse(text));
}

export function getSelectionPixels(
  layer: Layer,
  selection: Selection | null,
): Clip | null {
  const bounds = selectionBounds(selection);
  if (!bounds) return null;
  const layerPixels = expandPixels(layer.pixels);
  const pixels: PixelArray = [];
  for (let y = 0; y < bounds.h; y++)
    for (let x = 0; x < bounds.w; x++)
      pixels.push(layerPixels[idx(bounds.x + x, bounds.y + y)]);
  return { ...bounds, pixels };
}

export function pastePixels(
  layer: Layer,
  clip: Clip | null,
  targetX: number,
  targetY: number,
  eraseSource = false,
) {
  if (!clip) return;
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  if (eraseSource) {
    for (let y = 0; y < clip.h; y++)
      for (let x = 0; x < clip.w; x++) {
        const sx = clip.x + x;
        const sy = clip.y + y;
        if (sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE)
          pixels[idx(sx, sy)] = null;
      }
  }
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const tx = targetX + x;
      const ty = targetY + y;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
        pixels[idx(tx, ty)] = clip.pixels[y * clip.w + x];
    }
}

export function eraseClipPixels(layer: Layer, clip: Clip) {
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const tx = clip.x + x;
      const ty = clip.y + y;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
        pixels[idx(tx, ty)] = null;
    }
}

export function isShapeTool(value: Tool): value is ShapeTool {
  return value === "line" || value === "rect" || value === "ellipse";
}

export function boundsFromPoints(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x) + 1,
    h: Math.abs(end.y - start.y) + 1,
  };
}
