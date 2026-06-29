import test from "node:test";
import assert from "node:assert/strict";
import {
  blankFrame,
  diffPixelBounds,
  floodFillPixels,
  indexOf,
  PIXEL_COUNT,
  unionDirtyRects,
} from "../shared/pixel-core.ts";
import {
  clearRenderCache,
  markLayerDirty,
  renderCacheStats,
  renderFrameCached,
} from "../web/canvas-renderer.ts";

class FakeContext2D {
  fillStyle = "";
  imageSmoothingEnabled = true;
  clearRect() {}
  fillRect() {}
  drawImage() {}
  createImageData(width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4), width, height };
  }
  putImageData() {}
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly context = new FakeContext2D();
  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

(globalThis as typeof globalThis & { document: unknown }).document = {
  createElement: (tag: string) => {
    assert.equal(tag, "canvas");
    return new FakeCanvas();
  },
};

test("dirty rectangle helpers find and merge only changed pixels", () => {
  const before = new Array(PIXEL_COUNT).fill(null);
  const after = before.slice();
  after[indexOf(3, 4)] = "#112233";
  after[indexOf(8, 9)] = "#445566";

  assert.deepEqual(diffPixelBounds(before, after), {
    x: 3,
    y: 4,
    width: 6,
    height: 6,
  });
  assert.deepEqual(
    unionDirtyRects(
      { x: 3, y: 4, width: 1, height: 1 },
      { x: 8, y: 9, width: 1, height: 1 },
    ),
    { x: 3, y: 4, width: 6, height: 6 },
  );
});

test("flood fill uses a bounded queue and returns the affected bounds", () => {
  const pixels = new Array(PIXEL_COUNT).fill(null);
  for (let y = 10; y < 14; y++)
    for (let x = 20; x < 25; x++) pixels[indexOf(x, y)] = "#111111";

  assert.deepEqual(floodFillPixels(pixels, 22, 12, "#abcdef"), {
    x: 20,
    y: 10,
    width: 5,
    height: 4,
  });
  assert.equal(pixels[indexOf(20, 10)], "#abcdef");
  assert.equal(pixels[indexOf(19, 10)], null);
  assert.equal(floodFillPixels(pixels, 22, 12, "#abcdef"), null);
});

test("layer and frame caches reuse unchanged frames and compose dirty regions", () => {
  clearRenderCache();
  const frame = blankFrame();
  const transparent = { mode: "transparent", color: "#0f172a" } as const;
  const colored = { mode: "color", color: "#0f172a" } as const;

  renderFrameCached(frame, transparent);
  renderFrameCached(frame, colored);
  renderFrameCached(frame, transparent);
  let stats = renderCacheStats();
  assert.equal(stats.frameHits, 1);

  const layer = frame.layers[0];
  const pixels = Array.isArray(layer.pixels) ? layer.pixels.slice() : [];
  pixels[indexOf(7, 11)] = "#60a5fa";
  layer.pixels = pixels;
  markLayerDirty(layer.id, { x: 7, y: 11, width: 1, height: 1 });

  renderFrameCached(frame, transparent);
  renderFrameCached(frame, colored);
  stats = renderCacheStats();
  assert.equal(stats.layerPartialRenders, 1);
  assert.equal(stats.layerPixelsPainted, PIXEL_COUNT + 1);
  assert.equal(stats.framePartialRenders, 2);
  assert.equal(stats.framePixelsComposited, PIXEL_COUNT * 2 + 2);
});

test("unmarked immutable edits use the safe diff fallback", () => {
  clearRenderCache();
  const frame = blankFrame();
  renderFrameCached(frame);
  const layer = frame.layers[0];
  const pixels = Array.isArray(layer.pixels) ? layer.pixels.slice() : [];
  pixels[indexOf(100, 101)] = "#facc15";
  layer.pixels = pixels;

  renderFrameCached(frame);
  const stats = renderCacheStats();
  assert.equal(stats.layerPartialRenders, 1);
  assert.equal(stats.framePartialRenders, 1);
});
