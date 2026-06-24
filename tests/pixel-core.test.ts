import assert from "node:assert/strict";
import test from "node:test";
import {
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
  SIZE,
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
  assert.equal(
    godot.files.spritesheet,
    "res://assets/hero_knight/spritesheets/hero_knight_idle_west_sheet.png",
  );
  assert.equal(atlas.meta.size.w, SIZE * 2);
  assert.equal(atlas.frames.idle_west_01.duration, 250);
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
