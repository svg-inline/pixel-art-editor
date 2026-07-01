import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAssetOf,
  atlasMetadata,
  createExportProfile,
  expandProject,
  godotMetadata,
  spritesheetPlan,
  unityMetadata,
  validateExportProfile,
} from "../shared/pixel-core.ts";
import { exportPackageFiles } from "../shared/pro-export.ts";

function profileProject() {
  return expandProject({
    activeAssetId: "hero",
    activeAnimationId: "walk-s",
    assets: [{
      id: "hero",
      name: "Profile Hero",
      animations: [
        { id: "idle-n", name: "idle", direction: "N", fps: 6, frames: [{ id: "idle-0" }] },
        { id: "walk-s", name: "walk", direction: "S", fps: 8, frames: [
          { id: "walk-0", durationMs: 100 },
          { id: "walk-1", durationMs: 140 },
        ] },
      ],
    }],
  });
}

test("canonical presets migrate into every asset", () => {
  const profiles = activeAssetOf(profileProject()).exportProfiles;
  assert.deepEqual(profiles.map(({ preset, engine, scope }) => ({ preset, engine, scope })), [
    { preset: "generic_png", engine: "generic", scope: "active_animation" },
    { preset: "spritesheet_grid", engine: "generic", scope: "active_animation" },
    { preset: "godot_4", engine: "godot", scope: "all_animations" },
    { preset: "unity_2d", engine: "unity", scope: "all_animations" },
    { preset: "aseprite_json", engine: "generic", scope: "active_animation" },
    { preset: "web_preview", engine: "generic", scope: "active_animation" },
  ]);
});

test("spritesheet dimensions include integer scale, padding and spacing", () => {
  const project = profileProject();
  const profile = createExportProfile("spritesheet_grid", { scale: 2, padding: 3, spacing: 5 });
  const plan = spritesheetPlan(project, profile);

  assert.deepEqual(
    { width: plan.width, height: plan.height, columns: plan.columns, rows: plan.rows },
    { width: 1035, height: 518, columns: 2, rows: 1 },
  );
  assert.deepEqual(plan.frames.map((frame) => frame.destination), [
    { x: 3, y: 3, w: 512, h: 512 },
    { x: 520, y: 3, w: 512, h: 512 },
  ]);
});

test("Godot and Unity metadata snapshot the same canonical layout", () => {
  const project = profileProject();
  const godot = godotMetadata(project);
  const unity = unityMetadata(project);

  assert.deepEqual({
    godot: {
      sheet: godot.sheet,
      directions: godot.animations.map((animation) => animation.direction),
      durations: godot.animations.flatMap((animation) => animation.frame_rects.map((frame) => frame.durationMs)),
    },
    unity: {
      sheet: unity.sheetLayout,
      directions: unity.animations.map((animation) => animation.direction),
      durations: unity.animations.flatMap((animation) => animation.frames.map((frame) => frame.durationMs)),
    },
  }, {
    godot: {
      sheet: { layout: "animation_rows", columns: 2, rows: 2, width: 512, height: 512, padding: 0, spacing: 0, scale: 1, trim: false },
      directions: ["N", "S"], durations: [167, 100, 140],
    },
    unity: {
      sheet: { layout: "animation_rows", columns: 2, rows: 2, width: 512, height: 512, padding: 0, spacing: 0, scale: 1, trim: false },
      directions: ["N", "S"], durations: [167, 100, 140],
    },
  });
});

test("atlas respects selected direction and ZIP contains only PNG, JSON and README", () => {
  const project = profileProject();
  const asset = activeAssetOf(project);
  const index = asset.exportProfiles.findIndex((profile) => profile.preset === "spritesheet_grid");
  asset.exportProfiles[index] = createExportProfile("spritesheet_grid", { directions: ["S"], padding: 2, spacing: 1 });
  const atlas = atlasMetadata(project);
  const validation = validateExportProfile(project, asset.exportProfiles[index]);
  const files = exportPackageFiles(project, "spritesheet_grid", new Uint8Array([137, 80, 78, 71]));

  assert.equal(validation.valid, true);
  assert.deepEqual(atlas.meta.size, { w: 517, h: 260 });
  assert.deepEqual(Object.keys(atlas.frames), ["walk_00", "walk_01"]);
  assert.deepEqual(files.map((file) => file.name), [
    "profile_hero_walk_sheet.png",
    "profile_hero_walk.atlas.json",
    "README.md",
  ]);
  assert.equal(files.some((file) => file.name.includes("project") || file.name.includes("runtime")), false);
});
