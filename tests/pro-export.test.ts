import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  expandProject,
  indexOf,
  setPixel,
} from "../shared/pixel-core.ts";
import {
  asepriteJson,
  encodeGifFromProject,
  encodeZip,
  professionalMetadataFiles,
  projectFromAsepriteJson,
  tilemapMetadata,
} from "../shared/pro-export.ts";

function sampleProject() {
  const project = expandProject({
    godot: {
      asset: "Export Hero",
      animation: "idle_s",
      direction: "S",
      fps: 8,
      loop: true,
    },
  });
  const frame = activeFrameOf(project);
  frame.duration = 180;
  frame.pivot = { x: 120, y: 144 };
  frame.hitboxes.push({
    id: "attack",
    name: "attackbox",
    kind: "attackbox",
    x: 100,
    y: 110,
    w: 20,
    h: 24,
  });
  setPixel(activeLayerOf(frame), 1, 1, "#ff0000");
  setPixel(activeLayerOf(frame), 2, 1, "#00ff00");
  return project;
}

test("encodeGifFromProject exports a GIF89a animation", () => {
  const gif = encodeGifFromProject(sampleProject());
  const header = new TextDecoder().decode(gif.slice(0, 6));

  assert.equal(header, "GIF89a");
  assert.equal(gif.at(-1), 0x3b);
  assert.ok(gif.length > 100);
});

test("encodeZip stores professional export files", () => {
  const project = sampleProject();
  const zip = encodeZip([
    { name: "metadata/aseprite.json", data: JSON.stringify(asepriteJson(project)) },
    ...professionalMetadataFiles(project),
  ]);

  assert.deepEqual(Array.from(zip.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(new TextDecoder().decode(zip).includes("metadata/tilemap.json"));
  assert.ok(new TextDecoder().decode(zip).includes("metadata/godot.animations.json"));
});

test("aseprite JSON round-trips through embedded project metadata", () => {
  const project = sampleProject();
  const json = asepriteJson(project);
  const imported = projectFromAsepriteJson(json);

  assert.ok(imported);
  assert.equal(json.meta.frameTags[0].name, "idle_s");
  assert.equal(json.frames.idle_s_00_png?.duration, undefined);
  assert.equal(json.frames["idle_s_00.png"].duration, 180);
  assert.equal(imported.godot.asset, "Export Hero");
  assert.equal(imported.frames[0].hitboxes[0].kind, "attackbox");
});

test("tilemapMetadata exports tile grid and frame gameplay data", () => {
  const tilemap = tilemapMetadata(sampleProject(), 16);

  assert.equal(tilemap.format, "pixel-art-mcp-tilemap-v1");
  assert.equal(tilemap.columns, 16);
  assert.equal(tilemap.rows, 16);
  assert.ok(tilemap.tileCount >= 1);
  assert.equal(tilemap.frames[0].tiles.length, 16);
  assert.equal(tilemap.frames[0].hitboxes[0].kind, "attackbox");
});
