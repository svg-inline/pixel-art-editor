import {
  compositeFrameRgba,
  diffPixelBounds,
  expandPixels,
  FULL_CANVAS_RECT,
  normalizeDirtyRect,
  SIZE,
  unionDirtyRects,
  type DirtyRect,
  type Frame,
  type Layer,
  type PixelArray,
  type ProjectBackground,
} from "../shared/pixel-core.ts";

type LayerCacheEntry = {
  canvas: HTMLCanvasElement;
  source: Layer["pixels"];
  pixels: PixelArray;
  visible: boolean;
  opacity: number;
  version: number;
};

type PreparedLayer = {
  entry: LayerCacheEntry;
  dirty: DirtyRect | null;
};

type FrameCacheEntry = {
  canvas: HTMLCanvasElement;
  layerIds: string[];
  layerVersions: number[];
  layerSources: Layer["pixels"][];
  layerMetadata: string[];
};

type LayerDirtyChange = {
  version: number;
  rect: DirtyRect;
};

export type RenderStats = {
  layerHits: number;
  layerMisses: number;
  layerPartialRenders: number;
  layerPixelsPainted: number;
  frameHits: number;
  frameMisses: number;
  framePartialRenders: number;
  framePixelsComposited: number;
};

const MAX_LAYER_CACHE_ENTRIES = 192;
const MAX_FRAME_CACHE_ENTRIES = 128;
const layerCache = new Map<string, LayerCacheEntry>();
const frameCache = new Map<string, FrameCacheEntry>();
const layerVersions = new Map<string, number>();
const layerDirtyHistory = new Map<string, LayerDirtyChange[]>();
const stats: RenderStats = freshStats();

const littleEndian = (() => {
  const bytes = new Uint8Array(4);
  new Uint32Array(bytes.buffer)[0] = 0x01020304;
  return bytes[0] === 4;
})();

function freshStats(): RenderStats {
  return {
    layerHits: 0,
    layerMisses: 0,
    layerPartialRenders: 0,
    layerPixelsPainted: 0,
    frameHits: 0,
    frameMisses: 0,
    framePartialRenders: 0,
    framePixelsComposited: 0,
  };
}

function makeCanvas(width = SIZE, height = SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function touchEntry<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function nextLayerVersion(layerId: string) {
  const version = (layerVersions.get(layerId) || 0) + 1;
  layerVersions.set(layerId, version);
  return version;
}

function recordLayerChange(layerId: string, rect: DirtyRect) {
  const version = nextLayerVersion(layerId);
  const history = layerDirtyHistory.get(layerId) || [];
  history.push({ version, rect });
  if (history.length > 64) history.splice(0, history.length - 64);
  layerDirtyHistory.set(layerId, history);
  return version;
}

function layerDirtySince(layerId: string, previousVersion: number, version: number) {
  if (previousVersion === version) return null;
  const history = layerDirtyHistory.get(layerId) || [];
  const changes = history.filter(
    (change) => change.version > previousVersion && change.version <= version,
  );
  if (
    changes.length !== version - previousVersion ||
    changes[0]?.version !== previousVersion + 1
  )
    return FULL_CANVAS_RECT;
  return changes.reduce<DirtyRect | null>(
    (dirty, change) => unionDirtyRects(dirty, change.rect),
    null,
  );
}

export function markLayerDirty(layerId: string, rect: DirtyRect) {
  const normalized = normalizeDirtyRect(rect);
  if (!normalized) return;
  recordLayerChange(layerId, normalized);
}

export function markLayerFullyDirty(layerId: string) {
  markLayerDirty(layerId, FULL_CANVAS_RECT);
}

function writeLayerRegion(
  entry: LayerCacheEntry,
  pixels: PixelArray,
  rect: DirtyRect,
) {
  const ctx = entry.canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  if (!entry.visible) return;

  const image = ctx.createImageData(rect.width, rect.height);
  const words = new Uint32Array(image.data.buffer);
  const alpha = Math.round(Math.max(0, Math.min(1, entry.opacity)) * 255);
  let output = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    let input = y * SIZE + rect.x;
    for (let x = 0; x < rect.width; x++, input++, output++) {
      const pixel = pixels[input];
      if (!pixel) continue;
      const rgb = Number.parseInt(pixel.slice(1), 16);
      const red = (rgb >> 16) & 255;
      const green = (rgb >> 8) & 255;
      const blue = rgb & 255;
      words[output] = littleEndian
        ? ((alpha << 24) | (blue << 16) | (green << 8) | red) >>> 0
        : ((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0;
    }
  }
  ctx.putImageData(image, rect.x, rect.y);
}

function prepareLayer(layer: Layer): PreparedLayer {
  const cached = layerCache.get(layer.id);
  const pixels = expandPixels(layer.pixels);

  if (!cached) {
    const entry: LayerCacheEntry = {
      canvas: makeCanvas(),
      source: layer.pixels,
      pixels,
      visible: layer.visible,
      opacity: layer.opacity,
      version: layerVersions.get(layer.id) || 0,
    };
    writeLayerRegion(entry, pixels, FULL_CANVAS_RECT);
    touchEntry(layerCache, layer.id, entry, MAX_LAYER_CACHE_ENTRIES);
    stats.layerMisses++;
    stats.layerPixelsPainted += SIZE * SIZE;
    return { entry, dirty: FULL_CANVAS_RECT };
  }

  const metadataChanged =
    cached.visible !== layer.visible || cached.opacity !== layer.opacity;
  let version = layerVersions.get(layer.id) || 0;
  if (metadataChanged) {
    version = recordLayerChange(layer.id, FULL_CANVAS_RECT);
  } else if (version === cached.version && cached.source !== layer.pixels) {
    const fallbackDirty = diffPixelBounds(cached.pixels, pixels);
    if (fallbackDirty) version = recordLayerChange(layer.id, fallbackDirty);
  }
  const dirty = layerDirtySince(layer.id, cached.version, version);

  if (!dirty) {
    cached.source = layer.pixels;
    cached.pixels = pixels;
    touchEntry(layerCache, layer.id, cached, MAX_LAYER_CACHE_ENTRIES);
    stats.layerHits++;
    return { entry: cached, dirty: null };
  }

  cached.version = version;
  cached.source = layer.pixels;
  cached.pixels = pixels;
  cached.visible = layer.visible;
  cached.opacity = layer.opacity;
  writeLayerRegion(cached, pixels, dirty);
  touchEntry(layerCache, layer.id, cached, MAX_LAYER_CACHE_ENTRIES);
  stats.layerMisses++;
  stats.layerPixelsPainted += dirty.width * dirty.height;
  if (dirty.width !== SIZE || dirty.height !== SIZE) stats.layerPartialRenders++;
  return { entry: cached, dirty };
}

function backgroundSignature(background: ProjectBackground) {
  return `${background?.mode || "transparent"}:${background?.color || ""}`;
}

function frameCacheKey(frame: Frame, background: ProjectBackground) {
  return `${frame.id};${backgroundSignature(background)}`;
}

function composeFrameRegion(
  entry: FrameCacheEntry,
  layers: PreparedLayer[],
  background: ProjectBackground,
  rect: DirtyRect,
) {
  const ctx = entry.canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  if (background?.mode === "color") {
    ctx.fillStyle = background.color || "#0f172a";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  for (const layer of layers) {
    if (!layer.entry.visible) continue;
    ctx.drawImage(
      layer.entry.canvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }
}

export function renderFrameCached(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const key = frameCacheKey(frame, background);
  const cached = frameCache.get(key);
  const layerIds = frame.layers.map((layer) => layer.id);
  const sourceMatches =
    cached &&
    cached.layerIds.length === frame.layers.length &&
    frame.layers.every(
      (layer, index) =>
        cached.layerIds[index] === layer.id &&
        cached.layerVersions[index] === (layerVersions.get(layer.id) || 0) &&
        cached.layerSources[index] === layer.pixels &&
        cached.layerMetadata[index] === `${layer.visible}:${layer.opacity}`,
    );
  if (sourceMatches) {
    touchEntry(frameCache, key, cached, MAX_FRAME_CACHE_ENTRIES);
    stats.frameHits++;
    return cached.canvas;
  }

  const layers = frame.layers.map(prepareLayer);
  const versions = layers.map((layer) => layer.entry.version);

  const unchanged =
    cached &&
    cached.layerIds.length === layerIds.length &&
    cached.layerIds.every(
      (id, index) => id === layerIds[index] && cached.layerVersions[index] === versions[index],
    );
  if (unchanged) {
    cached.layerSources = frame.layers.map((layer) => layer.pixels);
    cached.layerMetadata = frame.layers.map(
      (layer) => `${layer.visible}:${layer.opacity}`,
    );
    touchEntry(frameCache, key, cached, MAX_FRAME_CACHE_ENTRIES);
    stats.frameHits++;
    return cached.canvas;
  }

  const entry: FrameCacheEntry = cached || {
    canvas: makeCanvas(),
    layerIds: [],
    layerVersions: [],
    layerSources: [],
    layerMetadata: [],
  };
  let dirty: DirtyRect | null = null;
  const sameStack =
    cached &&
    cached.layerIds.length === layerIds.length &&
    cached.layerIds.every((id, index) => id === layerIds[index]);
  if (sameStack) {
    for (let index = 0; index < layers.length; index++) {
      if (cached.layerVersions[index] === versions[index]) continue;
      dirty = unionDirtyRects(
        dirty,
        layerDirtySince(layerIds[index], cached.layerVersions[index], versions[index]),
      );
      if (dirty?.width === SIZE && dirty.height === SIZE) break;
    }
  } else {
    dirty = FULL_CANVAS_RECT;
  }
  dirty ||= FULL_CANVAS_RECT;

  composeFrameRegion(entry, layers, background, dirty);
  entry.layerIds = layerIds;
  entry.layerVersions = versions;
  entry.layerSources = frame.layers.map((layer) => layer.pixels);
  entry.layerMetadata = frame.layers.map(
    (layer) => `${layer.visible}:${layer.opacity}`,
  );
  touchEntry(frameCache, key, entry, MAX_FRAME_CACHE_ENTRIES);
  stats.frameMisses++;
  stats.framePixelsComposited += dirty.width * dirty.height;
  if (dirty.width !== SIZE || dirty.height !== SIZE) stats.framePartialRenders++;
  return entry.canvas;
}

// Export and AI diff paths intentionally bypass editor caches so persisted
// output can never observe stale browser state.
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
  layerVersions.clear();
  layerDirtyHistory.clear();
  resetRenderCacheStats();
}

export function resetRenderCacheStats() {
  Object.assign(stats, freshStats());
}

export function renderCacheStats() {
  return { ...stats };
}
