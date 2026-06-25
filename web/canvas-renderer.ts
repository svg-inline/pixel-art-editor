import {
  compositeFrameRgba,
  expandPixels,
  SIZE,
  type Frame,
  type Layer,
  type ProjectBackground,
} from "../shared/pixel-core.ts";

type LayerCacheEntry = {
  signature: string;
  canvas: HTMLCanvasElement;
};

type FrameCacheEntry = {
  signature: string;
  canvas: HTMLCanvasElement;
};

export type RenderStats = {
  layerHits: number;
  layerMisses: number;
  frameHits: number;
  frameMisses: number;
};

const layerCache = new Map<string, LayerCacheEntry>();
const frameCache = new Map<string, FrameCacheEntry>();
const stats: RenderStats = {
  layerHits: 0,
  layerMisses: 0,
  frameHits: 0,
  frameMisses: 0,
};

function makeCanvas(width = SIZE, height = SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function pixelsHash(layer: Layer) {
  const pixels = expandPixels(layer.pixels);
  let hash = 2166136261;
  for (let i = 0; i < pixels.length; i++) {
    const px = pixels[i];
    if (!px) {
      hash ^= 0;
      hash = Math.imul(hash, 16777619);
      continue;
    }
    for (let j = 1; j < px.length; j += 2) {
      hash ^= px.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function layerSignature(layer: Layer) {
  return [
    layer.visible ? 1 : 0,
    layer.opacity,
    pixelsHash(layer),
  ].join(":");
}

function renderLayer(layer: Layer) {
  const signature = layerSignature(layer);
  const cached = layerCache.get(layer.id);
  if (cached?.signature === signature) {
    stats.layerHits++;
    return cached.canvas;
  }
  stats.layerMisses++;
  const canvas = cached?.canvas || makeCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (layer.visible) {
    const pixels = expandPixels(layer.pixels);
    const image = ctx.createImageData(SIZE, SIZE);
    const data = image.data;
    const alpha = Math.round(Math.max(0, Math.min(1, layer.opacity)) * 255);
    for (let i = 0; i < pixels.length; i++) {
      const px = pixels[i];
      if (!px) continue;
      const n = parseInt(px.slice(1), 16);
      const di = i * 4;
      data[di] = (n >> 16) & 255;
      data[di + 1] = (n >> 8) & 255;
      data[di + 2] = n & 255;
      data[di + 3] = alpha;
    }
    ctx.putImageData(image, 0, 0);
  }
  layerCache.set(layer.id, { signature, canvas });
  return canvas;
}

function backgroundSignature(background: ProjectBackground) {
  return `${background?.mode || "transparent"}:${background?.color || ""}`;
}

function frameSignature(frame: Frame, background: ProjectBackground) {
  return [
    backgroundSignature(background),
    frame.layers
      .map((layer) => `${layer.id}:${layerSignature(layer)}`)
      .join("|"),
  ].join(";");
}

export function renderFrameCached(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const signature = frameSignature(frame, background);
  const cached = frameCache.get(frame.id);
  if (cached?.signature === signature) {
    stats.frameHits++;
    return cached.canvas;
  }
  stats.frameMisses++;
  const canvas = cached?.canvas || makeCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = false;
  if (background?.mode === "color") {
    ctx.fillStyle = background.color || "#0f172a";
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    ctx.drawImage(renderLayer(layer), 0, 0);
  }
  frameCache.set(frame.id, { signature, canvas });
  return canvas;
}

export function renderFrameFresh(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(compositeFrameRgba(frame, background)),
      SIZE,
      SIZE,
    ),
    0,
    0,
  );
  return canvas;
}

export function clearRenderCache() {
  layerCache.clear();
  frameCache.clear();
}

export function renderCacheStats() {
  return { ...stats };
}
