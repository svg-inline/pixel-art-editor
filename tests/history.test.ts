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
  createDrawEllipseCommand,
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

test("drawEllipse command records a compact pixel patch", () => {
  const before = expandProject({});
  const command = createDrawEllipseCommand(before, 8, 8, 3, 2, "#111827");

  assert.ok(command);
  assert.equal(command.command.type, "drawEllipse");
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "pixels.changed");
  if (command.patches[0].type === "pixels.changed") {
    assert.ok(command.patches[0].changes.length > 0);
  }

  const after = applyCommand(before, command);
  assert.ok(
    expandPixels(activeLayerOf(activeFrameOf(after)).pixels).some(Boolean),
  );
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

test("frame name and duration changes are stored as frame patch", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const frame = activeFrameOf(after);
  frame.name = "Anticipation";
  frame.duration = 240;

  const command = createProjectCommand(
    before,
    after,
    "project.change",
    { operation: "frame.update" },
    "test",
  );

  assert.ok(command);
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "frame.updated");
  assert.equal(JSON.stringify(command).includes("project.replaced"), false);

  const applied = applyCommand(before, command);
  assert.equal(activeFrameOf(applied).name, "Anticipation");
  assert.equal(activeFrameOf(applied).duration, 240);

  const reverted = revertCommand(applied, command);
  assert.equal(activeFrameOf(reverted).name, activeFrameOf(before).name);
  assert.equal(activeFrameOf(reverted).duration, activeFrameOf(before).duration);
});

test("frame pivot and hitbox changes are stored as frame patch", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const frame = activeFrameOf(after);
  frame.pivot = { x: 96, y: 144 };
  frame.hitboxes.push({ id: "box-1", name: "hitbox", x: 10, y: 20, w: 30, h: 40 });

  const command = createProjectCommand(
    before,
    after,
    "project.change",
    { operation: "frame.gameData" },
    "test",
  );

  assert.ok(command);
  assert.equal(command.patches.length, 1);
  assert.equal(command.patches[0].type, "frame.updated");
  assert.equal(JSON.stringify(command).includes("project.replaced"), false);

  const applied = applyCommand(before, command);
  assert.deepEqual(activeFrameOf(applied).pivot, { x: 96, y: 144 });
  assert.equal(activeFrameOf(applied).hitboxes[0].name, "hitbox");

  const reverted = revertCommand(applied, command);
  assert.deepEqual(activeFrameOf(reverted).pivot, activeFrameOf(before).pivot);
  assert.equal(activeFrameOf(reverted).hitboxes.length, 0);
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
