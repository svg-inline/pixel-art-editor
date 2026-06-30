import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAnimationOf,
  activeAssetOf,
  atlasMetadata,
  blankLayer,
  colorsUsed,
  compactProject,
  compositeFrameRgba,
  expandProject,
  generatePixelArtFromPrompt,
  godotMetadata,
  indexOf,
  qualityReport,
  rotate90Selection,
  SIZE,
  unityMetadata,
} from "../shared/pixel-core.ts";

test("normalizes legacy layer projects and compact RLE pixels", () => {
  const compact = compactProject({
    layers: [
      {
        name: "Base",
        pixels: {
          encoding: "rle",
          size: SIZE * SIZE,
          runs: [
            [1, "#ABCDEF"],
            [SIZE * SIZE - 1, null],
          ],
        },
      },
    ],
    godot: { direction: "bad", fps: 999 },
    revision: "3",
  });

  const project = expandProject(compact);

  assert.equal(project.size, SIZE);
  assert.equal(project.revision, 3);
  assert.equal(project.frames.length, 1);
  assert.equal(project.frames[0].layers.length, 1);
  assert.equal(project.frames[0].layers[0].pixels[indexOf(0, 0)], "#abcdef");
  assert.equal(project.godot.direction, "W");
  assert.equal(project.godot.fps, 60);
  assert.equal(project.schemaVersion, 3);
  assert.equal(project.assets.length, 1);
  assert.equal(activeAssetOf(project).animations.length, 1);
  assert.equal(activeAnimationOf(project).frames, project.frames);
  assert.deepEqual(project.frames[0].pivot, { x: 128, y: 128 });
  assert.deepEqual(project.frames[0].hitboxes, []);
  assert.equal(project.frames[0].durationMs, project.frames[0].duration);
  assert.equal(activeAssetOf(project).exportProfiles.length, 2);
});

test("reports shared colors and QA warnings consistently", () => {
  const layer = blankLayer("Paint");
  const pixels = layer.pixels as (string | null)[];
  pixels[indexOf(120, 120)] = "#111827";
  pixels[indexOf(121, 120)] = "#111827";
  pixels[indexOf(122, 120)] = "#ffffff";
  const project = expandProject({ frames: [{ name: "Frame", layers: [layer] }] });

  assert.deepEqual(colorsUsed(project).slice(0, 2), [
    ["#111827", 2],
    ["#ffffff", 1],
  ]);

  const report = qualityReport(project, 1);
  assert.equal(report.colors, 2);
  assert.equal(report.overLimit, true);
  assert.equal(report.falseCheckerboardPixels, 1);
  assert.ok(report.warnings.includes("palette_over_limit"));
  assert.ok(report.warnings.includes("false_checkerboard_pixels"));
});

test("composes visible layers with background and opacity", () => {
  const layer = blankLayer("Half red");
  layer.opacity = 0.5;
  (layer.pixels as (string | null)[])[indexOf(0, 0)] = "#ff0000";
  const frame = expandProject({ frames: [{ name: "Frame", layers: [layer] }] })
    .frames[0];

  const rgba = compositeFrameRgba(frame, { mode: "color", color: "#000000" });

  assert.deepEqual(Array.from(rgba.slice(0, 4)), [128, 0, 0, 255]);
});

test("generates common Godot and atlas metadata from normalized projects", () => {
  const project = expandProject({
    frames: [{ name: "A" }, { name: "B", duration: 250 }],
    godot: {
      asset: "Hero Knight",
      animation: "Idle West",
      direction: "W",
      fps: 8,
      loop: true,
    },
  });

  const godot = godotMetadata(project);
  const atlas = atlasMetadata(project);

  assert.equal(godot.asset, "hero_knight");
  assert.equal(godot.animations[0].frames, 2);
  assert.equal(godot.animations[0].direction, "W");
  assert.equal(godot.sheet.layout, "animation_rows");
  assert.equal(
    godot.files.asset_spritesheet,
    "res://assets/hero_knight/spritesheets/hero_knight_sheet.png",
  );
  assert.equal(
    godot.files.spritesheet,
    "res://assets/hero_knight/spritesheets/hero_knight_idle_west_sheet.png",
  );
  assert.equal(atlas.meta.size.w, SIZE * 2);
  assert.equal(atlas.frames.idle_west_01.duration, 250);
});

test("normalizes v2 assets, animations, pivot and hitboxes", () => {
  const project = expandProject({
    activeAssetId: "hero",
    activeAnimationId: "walk_s",
    assets: [
      {
        id: "hero",
        name: "Hero",
        palette: ["#ABCDEF"],
        animations: [
          {
            id: "idle_n",
            name: "idle_n",
            direction: "N",
            fps: 4,
            loop: true,
            frames: [{ id: "idle-1", name: "Idle" }],
          },
          {
            id: "walk_s",
            name: "walk_s",
            direction: "S",
            fps: 8,
            loop: false,
            frames: [
              {
                id: "walk-1",
                name: "Walk",
                duration: 120,
                pivot: { x: 127, y: 190 },
                hitboxes: [
                  {
                    id: "body",
                    name: "Body hurt",
                    x: 100,
                    y: 90,
                    w: 24,
                    h: 40,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(project.godot.asset, "Hero");
  assert.equal(project.godot.animation, "walk_s");
  assert.equal(project.godot.direction, "S");
  assert.equal(project.godot.loop, false);
  assert.equal(project.frames[0].id, "walk-1");
  assert.deepEqual(project.frames[0].pivot, { x: 127, y: 190 });
  assert.equal(project.frames[0].hitboxes[0].name, "Body hurt");
  assert.equal(project.frames[0].hitboxes[0].kind, "hurtbox");
  assert.deepEqual(project.palette, ["#abcdef"]);
  const godot = godotMetadata(project);
  const atlas = atlasMetadata(project);
  const unity = unityMetadata(project);
  assert.deepEqual(godot.animations[0].frame_rects[0].pivot, {
    x: 128,
    y: 128,
  });
  assert.deepEqual(godot.animations[1].frame_rects[0].pivot, {
    x: 127,
    y: 190,
  });
  assert.equal(godot.animations[1].frame_rects[0].hitboxes[0].name, "Body hurt");
  assert.equal(godot.animations[1].frame_rects[0].hitboxes[0].kind, "hurtbox");
  assert.equal(godot.animations[1].frame_rects[0].hitboxes[0].type, "hurtbox");
  assert.equal(godot.collision[0].type, "hurtbox");
  assert.equal(atlas.frames.walk_s_00.hitboxes[0].type, "hurtbox");
  assert.equal(unity.frames[0].hitboxes[0].type, "hurtbox");
});

test("migrates schema v2 frame data into explicit v3 durations and box groups", () => {
  const project = expandProject({
    schemaVersion: 2,
    assets: [
      {
        id: "hero",
        name: "Hero",
        animations: [
          {
            id: "attack-e",
            name: "attack",
            direction: "E",
            fps: 12,
            loop: false,
            pivot: { x: 80, y: 144 },
            frames: [
              {
                id: "attack-1",
                duration: 75,
                attackboxes: [
                  { id: "sword", name: "Sword", x: 140, y: 90, w: 30, h: 18 },
                ],
                hurtboxes: [
                  { id: "body", name: "Body", x: 90, y: 80, w: 28, h: 60 },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(project.schemaVersion, 3);
  assert.equal(project.frames[0].durationMs, 75);
  assert.deepEqual(project.frames[0].pivot, { x: 80, y: 144 });
  assert.equal(project.frames[0].pivotOverride, false);
  assert.equal(project.frames[0].hurtboxes[0].kind, "hurtbox");
  assert.equal(project.frames[0].attackboxes[0].kind, "attackbox");
  assert.equal(project.frames[0].hitboxes.length, 2);

  project.assets[0].animations[0].pivot = { x: 96, y: 160 };
  const inherited = expandProject(project);
  assert.deepEqual(inherited.frames[0].pivot, { x: 96, y: 160 });
});

test("Godot and Unity exports preserve multiple animations and directions", () => {
  const project = expandProject({
    activeAssetId: "hero",
    activeAnimationId: "walk-s",
    assets: [
      {
        id: "hero",
        name: "Hero",
        exportProfiles: [
          { id: "godot", name: "Godot", engine: "godot", pixelsPerUnit: 64 },
          { id: "unity", name: "Unity", engine: "unity", pixelsPerUnit: 32 },
        ],
        animations: [
          { id: "idle-n", name: "idle", direction: "N", fps: 6, frames: [{}] },
          {
            id: "walk-s",
            name: "walk",
            direction: "S",
            fps: 8,
            frames: [{ durationMs: 140 }],
          },
          { id: "attack-e", name: "attack", direction: "E", fps: 10, frames: [{}] },
        ],
      },
    ],
  });
  const godot = godotMetadata(project);
  const unity = unityMetadata(project);

  assert.deepEqual(godot.animations.map((item) => item.direction), ["N", "S", "E"]);
  assert.equal(godot.animations[1].frame_rects[0].durationMs, 140);
  assert.equal(godot.pixels_per_unit, 64);
  assert.deepEqual(unity.animations.map((item) => item.direction), ["N", "S", "E"]);
  assert.equal(unity.animations[1].frames[0].durationMs, 140);
  assert.equal(unity.frames, unity.animations[1].frames);
  assert.equal(unity.pixelsPerUnit, 32);
});

test("prompt parser honors explicit animation and direction fields", () => {
  const project = generatePixelArtFromPrompt(`
    Estado/animação: Idle.
    Direção: S — sul / frente.
    Evitar neste contexto: magia avançada, estrada limpa e segura.
    Regras universais: leitura clara e câmera 3/4 top-down.
  `);

  assert.equal(project.godot.animation, "idle_s");
  assert.equal(project.godot.direction, "S");
  assert.equal(project.godot.fps, 6);
});

test("rotates rectangular selection 90 degrees clockwise", () => {
  const rotated = rotate90Selection({
    x: 10,
    y: 20,
    w: 3,
    h: 2,
    pixels: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
  });

  assert.equal(rotated.x, 10);
  assert.equal(rotated.y, 20);
  assert.equal(rotated.w, 2);
  assert.equal(rotated.h, 3);
  assert.deepEqual(rotated.pixels, [
    "#444444",
    "#111111",
    "#555555",
    "#222222",
    "#666666",
    "#333333",
  ]);
});

test("rotates vertical selections and preserves transparent pixels", () => {
  const rotated = rotate90Selection({
    x: 0,
    y: 0,
    w: 2,
    h: 3,
    pixels: ["#111111", null, "#222222", "#333333", null, "#444444"],
  });

  assert.equal(rotated.w, 3);
  assert.equal(rotated.h, 2);
  assert.deepEqual(rotated.pixels, [
    null,
    "#222222",
    "#111111",
    "#444444",
    "#333333",
    null,
  ]);
});
