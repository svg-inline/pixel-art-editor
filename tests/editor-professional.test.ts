import assert from "node:assert/strict";
import test from "node:test";
import {
  blankFrame,
  blankLayer,
  expandPixels,
  expandProject,
  indexOf,
  lassoSelection,
  magicWandSelection,
  mergeLayerDown,
  setPixel,
  SIZE,
} from "../shared/pixel-core.ts";
import { validateProjectDiff } from "../shared/diff.ts";
import {
  applyCommand,
  createProjectCommand,
  revertCommand,
} from "../shared/history.ts";

test("lock alpha preserves transparent pixels and the opaque footprint", () => {
  const layer = blankLayer("Ink");
  assert.equal(setPixel(layer, 2, 3, "#ff0000"), true);
  layer.alphaLocked = true;
  assert.equal(setPixel(layer, 4, 5, "#00ff00"), false);
  assert.equal(setPixel(layer, 2, 3, "#00ff00"), true);
  assert.equal(setPixel(layer, 2, 3, null), false);
  const pixels = expandPixels(layer.pixels);
  assert.equal(pixels[indexOf(4, 5)], null);
  assert.equal(pixels[indexOf(2, 3)], "#00ff00");
});

test("locked layer rejects pixel edits", () => {
  const layer = blankLayer("Locked");
  layer.locked = true;
  assert.equal(setPixel(layer, 8, 9, "#abcdef"), false);
  assert.equal(expandPixels(layer.pixels)[indexOf(8, 9)], null);
});

test("merge down preserves visible order and activates the result", () => {
  const frame = blankFrame();
  const lower = frame.layers[0];
  const upper = blankLayer("Highlights");
  frame.layers.push(upper);
  frame.activeLayerId = upper.id;
  setPixel(lower, 1, 1, "#ff0000");
  setPixel(lower, 2, 2, "#ff0000");
  setPixel(upper, 1, 1, "#0000ff");
  assert.equal(mergeLayerDown(frame, 1), true);
  assert.equal(frame.layers.length, 1);
  assert.equal(frame.activeLayerId, lower.id);
  const pixels = expandPixels(frame.layers[0].pixels);
  assert.equal(pixels[indexOf(1, 1)], "#0000ff");
  assert.equal(pixels[indexOf(2, 2)], "#ff0000");
});

test("merge down refuses to mutate locked layers", () => {
  const frame = blankFrame();
  const upper = blankLayer("Locked top");
  upper.locked = true;
  frame.layers.push(upper);
  assert.equal(mergeLayerDown(frame, 1), false);
  assert.equal(frame.layers.length, 2);
});

test("magic wand selects only the contiguous color island", () => {
  const pixels = new Array<string | null>(SIZE * SIZE).fill(null);
  pixels[indexOf(1, 1)] = "#123456";
  pixels[indexOf(2, 1)] = "#123456";
  pixels[indexOf(10, 10)] = "#123456";
  const contiguous = magicWandSelection(pixels, 1, 1);
  assert.deepEqual(contiguous?.mask, [indexOf(1, 1), indexOf(2, 1)]);
  const global = magicWandSelection(pixels, 1, 1, false);
  assert.equal(global?.mask?.length, 3);
  assert.equal(global?.mask?.includes(indexOf(10, 10)), true);
});

test("lasso creates a pixel mask inside a freehand polygon", () => {
  const selection = lassoSelection([
    { x: 4, y: 4 },
    { x: 9, y: 4 },
    { x: 9, y: 9 },
    { x: 4, y: 9 },
  ]);
  assert.ok(selection?.mask?.includes(indexOf(6, 6)));
  assert.equal(selection?.mask?.includes(indexOf(2, 2)), false);
});

test("legacy layers normalize with editing locks disabled", () => {
  const project = expandProject({
    frames: [{ layers: [{ id: "legacy-layer", name: "Legacy", visible: true, opacity: 1, pixels: [] }] }],
  });
  const layer = project.frames[0].layers[0];
  assert.equal(layer.locked, false);
  assert.equal(layer.alphaLocked, false);
});

test("project diffs cannot bypass a locked layer", () => {
  const project = expandProject({});
  const frame = project.frames[0];
  const layer = frame.layers[0];
  layer.locked = true;
  assert.throws(
    () =>
      validateProjectDiff(project, {
        format: "pixel-art-project-diff-v1",
        version: 1,
        baseRevision: project.revision,
        createdAt: new Date().toISOString(),
        operations: [
          {
            type: "pixels.changed",
            frameId: frame.id,
            layerId: layer.id,
            changes: [{ index: indexOf(0, 0), before: null, after: "#abcdef" }],
          },
        ],
      }),
    /diff_layer_locked/,
  );
});

test("resize-style pixel and pivot edits are both reversible", () => {
  const before = expandProject({});
  const after = expandProject(before);
  after.frames[0].pivot = { x: 12, y: 34 };
  setPixel(after.frames[0].layers[0], 6, 7, "#abcdef");
  const command = createProjectCommand(
    before,
    after,
    "project.change",
    { operation: "canvas.resizeContent" },
    "test",
  );
  assert.ok(command);
  assert.equal(command.patches.some((patch) => patch.type === "frame.updated"), true);
  assert.equal(command.patches.some((patch) => patch.type === "pixels.changed"), true);
  const applied = applyCommand(before, command);
  assert.deepEqual(applied.frames[0].pivot, { x: 12, y: 34 });
  assert.equal(expandPixels(applied.frames[0].layers[0].pixels)[indexOf(6, 7)], "#abcdef");
  const reverted = revertCommand(applied, command);
  assert.deepEqual(reverted.frames[0].pivot, before.frames[0].pivot);
  assert.equal(expandPixels(reverted.frames[0].layers[0].pixels)[indexOf(6, 7)], null);
});
