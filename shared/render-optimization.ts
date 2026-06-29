import { PIXEL_COUNT, SIZE, type Pixel, type PixelArray } from "./model.ts";

export type DirtyRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const FULL_CANVAS_RECT: DirtyRect = {
  x: 0,
  y: 0,
  width: SIZE,
  height: SIZE,
};

export function normalizeDirtyRect(rect: DirtyRect): DirtyRect | null {
  const x1 = Math.max(0, Math.min(SIZE, Math.floor(rect.x)));
  const y1 = Math.max(0, Math.min(SIZE, Math.floor(rect.y)));
  const x2 = Math.max(x1, Math.min(SIZE, Math.ceil(rect.x + rect.width)));
  const y2 = Math.max(y1, Math.min(SIZE, Math.ceil(rect.y + rect.height)));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function unionDirtyRects(
  left: DirtyRect | null,
  right: DirtyRect | null,
): DirtyRect | null {
  if (!left) return right ? normalizeDirtyRect(right) : null;
  if (!right) return normalizeDirtyRect(left);
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const x2 = Math.max(left.x + left.width, right.x + right.width);
  const y2 = Math.max(left.y + left.height, right.y + right.height);
  return normalizeDirtyRect({ x, y, width: x2 - x, height: y2 - y });
}

export function diffPixelBounds(
  before: PixelArray,
  after: PixelArray,
): DirtyRect | null {
  if (before === after) return null;
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;
  const length = Math.min(PIXEL_COUNT, Math.max(before.length, after.length));
  for (let index = 0; index < length; index++) {
    if ((before[index] ?? null) === (after[index] ?? null)) continue;
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function floodFillPixels(
  pixels: PixelArray,
  x: number,
  y: number,
  color: Pixel,
): DirtyRect | null {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const start = y * SIZE + x;
  const target = pixels[start] ?? null;
  if (target === color) return null;

  // One bit per pixel (8 KiB), plus a fixed queue. This avoids the large
  // number of coordinate arrays created by the previous implementation.
  const visited = new Uint32Array(Math.ceil(PIXEL_COUNT / 32));
  const queue = new Int32Array(PIXEL_COUNT);
  let head = 0;
  let tail = 0;
  let minX = x;
  let minY = y;
  let maxX = x;
  let maxY = y;
  queue[tail++] = start;
  visited[start >>> 5] |= 1 << (start & 31);

  const enqueue = (neighbor: number) => {
    if (neighbor < 0 || (pixels[neighbor] ?? null) !== target) return;
    const word = neighbor >>> 5;
    const bit = 1 << (neighbor & 31);
    if (visited[word] & bit) return;
    visited[word] |= bit;
    queue[tail++] = neighbor;
  };

  while (head < tail) {
    const index = queue[head++];
    pixels[index] = color;
    const cx = index % SIZE;
    const cy = Math.floor(index / SIZE);
    minX = Math.min(minX, cx);
    minY = Math.min(minY, cy);
    maxX = Math.max(maxX, cx);
    maxY = Math.max(maxY, cy);

    enqueue(cx > 0 ? index - 1 : -1);
    enqueue(cx + 1 < SIZE ? index + 1 : -1);
    enqueue(cy > 0 ? index - SIZE : -1);
    enqueue(cy + 1 < SIZE ? index + SIZE : -1);
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
