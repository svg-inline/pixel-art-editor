import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  blankFrame,
  blankLayer,
  expandPixels,
  expandProject,
  indexOf,
} from "../shared/pixel-core.ts";
import {
  applyCommand,
  createDrawEllipseCommand,
  createDrawRectCommand,
  createFloodFillCommand,
  createProjectCommand,
  createSetPixelCommand,
  isHistoryCommand,
  revertCommand,
  summarizeHistoryPrompt,
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

test("fill_area records every filled pixel and reverts it", () => {
  const before = expandProject({});
  const command = createFloodFillCommand(before, 0, 0, "#123456");

  assert.ok(command);
  assert.equal(command.patches[0].type, "pixels.changed");
  const applied = applyCommand(before, command);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(applied)).pixels)[indexOf(255, 255)],
    "#123456",
  );
  const reverted = revertCommand(applied, command);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(reverted)).pixels)[indexOf(255, 255)],
    null,
  );
});

test("layer add and metadata changes use reversible patches instead of project snapshots", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const frame = activeFrameOf(after);
  const layer = blankLayer("Ink");
  frame.layers.push(layer);
  frame.activeLayerId = layer.id;

  const command = createProjectCommand(before, after, "create_layer", {}, "test");

  assert.ok(command);
  assert.equal(command.patches.some((patch) => patch.type === "layer.added"), true);
  assert.equal(command.patches.some((patch) => patch.type === "project.replaced"), false);
  const applied = applyCommand(before, command);
  assert.equal(activeFrameOf(applied).layers.at(-1)?.name, "Ink");
  assert.equal(activeFrameOf(applied).activeLayerId, layer.id);
  const reverted = revertCommand(applied, command);
  assert.equal(activeFrameOf(reverted).layers.length, 1);
  assert.equal(
    activeFrameOf(reverted).activeLayerId,
    activeFrameOf(before).activeLayerId,
  );
});

test("frame add uses a compact reversible collection patch", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const frame = blankFrame("Impact");
  after.frames.push(frame);
  after.activeFrameId = frame.id;

  const command = createProjectCommand(before, after, "create_frame", {}, "test");

  assert.ok(command);
  assert.equal(command.patches.some((patch) => patch.type === "frame.added"), true);
  assert.equal(command.patches.some((patch) => patch.type === "project.replaced"), false);
  const applied = applyCommand(before, command);
  assert.equal(applied.frames.length, 2);
  assert.equal(applied.activeFrameId, frame.id);
  const reverted = revertCommand(applied, command);
  assert.equal(reverted.frames.length, 1);
  assert.equal(reverted.activeFrameId, before.activeFrameId);
});

test("accepted AI edit keeps provider and only a summarized prompt in patch history", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const prompt = "  crie   uma espada de prata com brilho azul  ".repeat(8);
  const promptSummary = summarizeHistoryPrompt(prompt);
  activeLayerOf(activeFrameOf(after)).pixels = expandPixels(
    activeLayerOf(activeFrameOf(after)).pixels,
  );
  activeLayerOf(activeFrameOf(after)).pixels[indexOf(4, 4)] = "#60a5fa";

  const command = createProjectCommand(
    before,
    after,
    "ai_preview_accept",
    { provider: "fake-ai", promptSummary },
    "bridge",
  );

  assert.ok(command);
  assert.equal(command.command.label, "Aceitar alteração de IA");
  assert.equal(command.command.params?.provider, "fake-ai");
  assert.ok(String(command.command.params?.promptSummary).length <= 120);
  assert.equal(command.patches.some((patch) => patch.type === "pixels.changed"), true);
  assert.equal(command.patches.some((patch) => patch.type === "project.replaced"), false);
  const reverted = revertCommand(applyCommand(before, command), command);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(reverted)).pixels)[indexOf(4, 4)],
    null,
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
  frame.hitboxes.push({
    id: "box-1",
    name: "hitbox",
    kind: "hitbox",
    x: 10,
    y: 20,
    w: 30,
    h: 40,
  });

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
