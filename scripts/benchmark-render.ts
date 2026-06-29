import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import {
  blankFrame,
  blankLayer,
  compositeFrameRgba,
  indexOf,
  PIXEL_COUNT,
  SIZE,
  type Frame,
} from "../shared/pixel-core.ts";
import {
  clearRenderCache,
  renderCacheStats,
  renderFrameCached,
} from "../web/canvas-renderer.ts";

class BenchmarkContext2D {
  fillStyle = "";
  imageSmoothingEnabled = false;
  clearRect() {}
  fillRect() {}
  drawImage() {}
  createImageData(width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4), width, height };
  }
  putImageData() {}
}
class BenchmarkCanvas {
  width = 0;
  height = 0;
  context = new BenchmarkContext2D();
  getContext() {
    return this.context;
  }
}
(globalThis as typeof globalThis & { document: unknown }).document = {
  createElement: () => new BenchmarkCanvas(),
};

function projectFrames(layerCount: number, frameCount: number) {
  const pixels = new Array(PIXEL_COUNT).fill(null);
  for (let index = 0; index < pixels.length; index += 17)
    pixels[index] = "#60a5fa";
  const frames: Frame[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const frame = blankFrame(`Frame ${frameIndex + 1}`);
    frame.layers = [];
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
      const layer = blankLayer(`Layer ${layerIndex + 1}`);
      layer.pixels = pixels;
      frame.layers.push(layer);
    }
    frame.activeLayerId = frame.layers[0].id;
    frames.push(frame);
  }
  return frames;
}

const cases = [
  { name: "leve", layers: 2, frames: 4, iterations: 40 },
  { name: "medio", layers: 8, frames: 16, iterations: 8 },
  { name: "pesado", layers: 16, frames: 64, iterations: 2 },
];

console.log("Canvas render benchmark (Node, canvas calls stubbed)");
for (const scenario of cases) {
  const frames = projectFrames(scenario.layers, scenario.frames);
  let started = performance.now();
  let renders = 0;
  for (let iteration = 0; iteration < scenario.iterations; iteration++)
    for (const frame of frames) {
      compositeFrameRgba(frame);
      renders++;
    }
  const freshMs = performance.now() - started;

  clearRenderCache();
  for (const frame of frames) renderFrameCached(frame);
  started = performance.now();
  for (let iteration = 0; iteration < scenario.iterations; iteration++)
    for (const frame of frames) renderFrameCached(frame);
  const cachedMs = performance.now() - started;
  const stats = renderCacheStats();
  assert.equal(stats.frameHits, renders);
  console.log(
    `${scenario.name.padEnd(7)} ${String(SIZE + "x" + SIZE).padEnd(8)} ` +
      `${scenario.layers}L/${scenario.frames}F | fresh ${freshMs.toFixed(1)}ms | ` +
      `cached ${cachedMs.toFixed(1)}ms | ${(freshMs / Math.max(cachedMs, 0.001)).toFixed(1)}x`,
  );
}

assert.equal(indexOf(255, 255), PIXEL_COUNT - 1);
