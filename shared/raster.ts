import {
  clamp,
  expandPixels,
  indexOf,
  normHex,
  PIXEL_COUNT,
  SIZE,
  uid,
  type Layer,
  type Frame,
  type Pixel,
} from "./model.ts";

export function withPixels(layer: Layer): import("./model.ts").PixelArray {
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  return pixels;
}

export function canEditPixel(
  layer: Layer,
  x: number,
  y: number,
  color: Pixel,
) {
  if (layer.locked || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  if (!layer.alphaLocked) return true;
  const current = withPixels(layer)[indexOf(x, y)];
  return current !== null && color !== null;
}

export function setPixel(layer: Layer, x: number, y: number, color: Pixel) {
  const next = normHex(color);
  if (!canEditPixel(layer, x, y, next)) return false;
  const pixels = withPixels(layer);
  const pixelIndex = indexOf(x, y);
  if (pixels[pixelIndex] === next) return false;
  pixels[pixelIndex] = next;
  return true;
}

export function drawRect(
  layer: Layer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Pixel,
) {
  const c = color === null ? null : normHex(color);
  if (color !== null && !c) return;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPixel(layer, xx, yy, c);
}

export function drawEllipse(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Pixel,
) {
  const c = color === null ? null : normHex(color);
  if (color !== null && !c) return;
  rx = Math.max(1, Math.round(rx));
  ry = Math.max(1, Math.round(ry));
  for (let yy = -ry; yy <= ry; yy++)
    for (let xx = -rx; xx <= rx; xx++) {
      if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1)
        setPixel(layer, x + xx, y + yy, c);
    }
}

export function drawCircle(
  layer: Layer,
  x: number,
  y: number,
  r: number,
  color: Pixel,
) {
  drawEllipse(layer, x, y, r, r, color);
}

export function drawEllipseOutline(
  layer: Layer,
  x: number,
  y: number,
  rx: number,
  ry: number,
  thickness: number,
  color: Pixel,
) {
  const t = clamp(Math.round(thickness), 1, Math.max(rx, ry));
  drawEllipse(layer, x, y, rx, ry, color);
  if (rx > t && ry > t) drawEllipse(layer, x, y, rx - t, ry - t, null);
}

export function drawLine(
  layer: Layer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness = 1,
) {
  const c = normHex(color);
  if (!c) return;
  const t = clamp(Math.round(thickness), 1, 32);
  let dx = Math.abs(x2 - x1),
    sx = x1 < x2 ? 1 : -1,
    dy = -Math.abs(y2 - y1),
    sy = y1 < y2 ? 1 : -1,
    err = dx + dy;
  while (true) {
    drawRect(layer, x1 - Math.floor(t / 2), y1 - Math.floor(t / 2), t, t, c);
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
  if (layer.locked || layer.alphaLocked) return false;
  layer.pixels = new Array(PIXEL_COUNT).fill(null);
  return true;
}

function channel(color: string, shift: number) {
  return (Number.parseInt(color.slice(1), 16) >> shift) & 255;
}

function mergedPixel(
  bottom: Pixel,
  bottomOpacity: number,
  top: Pixel,
  topOpacity: number,
): Pixel {
  const bottomAlpha = bottom ? clamp(bottomOpacity, 0, 1) : 0;
  const topAlpha = top ? clamp(topOpacity, 0, 1) : 0;
  const outputAlpha = topAlpha + bottomAlpha * (1 - topAlpha);
  if (!outputAlpha || (!bottom && !top)) return null;
  const output = [16, 8, 0].map((shift) =>
    Math.round(
      (((top ? channel(top, shift) : 0) * topAlpha) +
        (bottom ? channel(bottom, shift) : 0) *
          bottomAlpha *
          (1 - topAlpha)) /
        outputAlpha,
    ),
  );
  return `#${output.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Merges a layer into the preceding (lower) layer in render order. */
export function mergeLayerDown(frame: Frame, upperIndex: number) {
  if (upperIndex <= 0 || upperIndex >= frame.layers.length) return false;
  const upper = frame.layers[upperIndex];
  const lower = frame.layers[upperIndex - 1];
  if (upper.locked || lower.locked) return false;
  const upperPixels = expandPixels(upper.pixels);
  const lowerPixels = expandPixels(lower.pixels);
  const next = new Array<Pixel>(PIXEL_COUNT).fill(null);
  for (let index = 0; index < PIXEL_COUNT; index++) {
    next[index] = mergedPixel(
      lower.visible ? lowerPixels[index] : null,
      lower.opacity,
      upper.visible ? upperPixels[index] : null,
      upper.opacity,
    );
  }
  lower.name = `${lower.name} + ${upper.name}`;
  lower.visible = lower.visible || upper.visible;
  lower.opacity = 1;
  lower.alphaLocked = false;
  lower.pixels = next;
  frame.layers.splice(upperIndex, 1);
  frame.activeLayerId = lower.id;
  return true;
}
