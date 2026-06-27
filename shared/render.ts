import {
  clamp,
  expandPixels,
  normalizeBackground,
  PIXEL_COUNT,
  type Frame,
  type ProjectBackground,
} from "./model.ts";

export function compositeFrameRgba(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const rgba = new Uint8Array(PIXEL_COUNT * 4);
  const bg = normalizeBackground(background);
  if (bg.mode === "color") {
    const n = parseInt(bg.color.slice(1), 16);
    for (let i = 0; i < PIXEL_COUNT; i++) {
      const di = i * 4;
      rgba[di] = (n >> 16) & 255;
      rgba[di + 1] = (n >> 8) & 255;
      rgba[di + 2] = n & 255;
      rgba[di + 3] = 255;
    }
  }
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    const alpha = clamp(layer.opacity, 0, 1);
    const pixels = expandPixels(layer.pixels);
    for (let i = 0; i < pixels.length; i++) {
      const px = pixels[i];
      if (!px) continue;
      const n = parseInt(px.slice(1), 16);
      const srcA = alpha;
      const di = i * 4;
      const dstA = rgba[di + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      rgba[di] = Math.round(
        (((n >> 16) & 255) * srcA + rgba[di] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 1] = Math.round(
        (((n >> 8) & 255) * srcA + rgba[di + 1] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 2] = Math.round(
        ((n & 255) * srcA + rgba[di + 2] * dstA * (1 - srcA)) / outA,
      );
      rgba[di + 3] = Math.round(outA * 255);
    }
  }
  return rgba;
}
