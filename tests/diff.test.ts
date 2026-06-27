import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  expandPixels,
  expandProject,
  generatePixelArtFromPrompt,
  indexOf,
  setPixel,
} from "../shared/pixel-core.ts";
import {
  MAX_DIFF_BYTES,
  applyProjectDiff,
  createProjectDiff,
  previewProjectDiff,
  validateProjectDiff,
} from "../shared/diff.ts";

test("ProjectDiff stores and applies pixel changes without full project replacement", () => {
  const before = expandProject({});
  const after = expandProject(before);
  const frame = activeFrameOf(after);
  const layer = activeLayerOf(frame);
  setPixel(layer, 8, 9, "#ABCDEF");

  const diff = createProjectDiff(before, after, {
    source: "mcp",
    tool: "set_pixel",
    prompt: "paint one pixel",
  });

  assert.ok(diff);
  assert.equal(diff.operations.length, 1);
  assert.equal(diff.operations[0].type, "pixels.changed");
  assert.equal(JSON.stringify(diff).includes("project.replaced"), false);

  const applied = applyProjectDiff(before, diff);
  assert.equal(
    expandPixels(activeLayerOf(activeFrameOf(applied)).pixels)[indexOf(8, 9)],
    "#abcdef",
  );
});

test("validateProjectDiff rejects pixel writes outside canvas bounds", () => {
  const project = expandProject({});
  const frame = activeFrameOf(project);
  const layer = activeLayerOf(frame);

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
            changes: [{ index: 256 * 256, before: null, after: "#111827" }],
          },
        ],
      }),
    /out_of_bounds/,
  );
});

test("previewProjectDiff returns summary for accept/reject UI", () => {
  const before = expandProject({});
  const after = expandProject(before);
  setPixel(activeLayerOf(activeFrameOf(after)), 1, 2, "#123456");
  const diff = createProjectDiff(before, after, {
    source: "mcp",
    tool: "set_pixel",
  });

  assert.ok(diff);
  const preview = previewProjectDiff(before, diff);
  assert.equal(preview.summary.operations, 1);
  assert.equal(preview.summary.pixelChanges, 1);
  assert.equal(preview.summary.replacesProject, false);
});

test("ProjectDiff represents generated art as structural operations, not whole project", () => {
  const before = expandProject({});
  const after = generatePixelArtFromPrompt("espada de prata", before);
  const diff = createProjectDiff(before, after, {
    source: "mcp",
    tool: "generate_pixel_art",
    prompt: "espada de prata",
  });

  assert.ok(diff);
  assert.ok(JSON.stringify(diff).length < MAX_DIFF_BYTES);
  assert.equal(diff.operations.some((op) => op.type === "project.replaced"), false);
  assert.ok(
    diff.operations.some(
      (op) =>
        op.type === "frames.replaced" ||
        op.type === "asset.animations.replaced",
    ),
  );
  const preview = previewProjectDiff(before, diff);
  assert.equal(preview.project.godot.asset, after.godot.asset);
  assert.equal(preview.summary.replacesProject, false);
});
