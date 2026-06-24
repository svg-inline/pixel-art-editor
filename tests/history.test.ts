import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  expandPixels,
  expandProject,
  indexOf,
} from "../shared/pixel-core.ts";
import {
  applyCommand,
  createDrawRectCommand,
  createProjectCommand,
  createSetPixelCommand,
  isHistoryCommand,
  revertCommand,
} from "../shared/history.ts";

test("setPixel history command stores only changed pixels and is reversible", () => {
  const before = expandProject({});
  const frame = activeFrameOf(before);
  const layer = activeLayerOf(frame);

  const command = createSetPixelCommand(
    before,
    4,
    5,
    "#ABCDEF",
    frame.id,
    layer.id,
    "test",
  );

  assert.ok(command);
  assert.equal(command.command.type, "setPixel");
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "pixels.changed");
  if (command.patches[0].type === "pixels.changed") {
    assert.deepEqual(command.patches[0].changes, [
      { index: indexOf(4, 5), before: null, after: "#abcdef" },
    ]);
  }

  const after = applyCommand(before, command);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(after)).pixels)[indexOf(4, 5)],
    "#abcdef",
  );
  const reverted = revertCommand(after, command);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(reverted)).pixels)[indexOf(4, 5)],
    null,
  );
});

test("drawRect command records a compact pixel patch", () => {
  const before = expandProject({});
  const command = createDrawRectCommand(before, 1, 2, 3, 4, "#111827");

  assert.ok(command);
  assert.equal(command.command.type, "drawRect");
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "pixels.changed");
  if (command.patches[0].type === "pixels.changed") {
    assert.equal(command.patches[0].changes.length, 12);
  }
});

test("100 small pixel edits do not persist project snapshots", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const layer = activeLayerOf(activeFrameOf(after));
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  for (let i = 0; i < 100; i++) pixels[i] = "#111827";

  const command = createProjectCommand(before, after, "drawLine", {}, "test");

  assert.ok(command);
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "pixels.changed");
  assert.equal(JSON.stringify(command).includes("project.replaced"), false);
  assert.ok(JSON.stringify(command).length < 9000);
});

test("legacy snapshot history entries are not accepted as commands", () => {
  assert.equal(
    isHistoryCommand({
      id: "legacy",
      at: "2026-06-24T00:00:00.000Z",
      project: expandProject({}),
    }),
    false,
  );
});
