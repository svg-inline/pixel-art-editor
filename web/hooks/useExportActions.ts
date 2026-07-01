import {
  activeAssetOf,
  atlasMetadata,
  godotMetadata,
  SIZE,
  slug,
  unityMetadata,
} from "../../shared/pixel-core.ts";
import type { Frame, Project } from "../../shared/pixel-core.ts";
import {
  asepriteJson,
  encodeGifFromProject,
  encodeZip,
  professionalMetadataFiles,
  tilemapMetadata,
} from "../../shared/pro-export.ts";
import { renderFrameFresh } from "../canvas-renderer.ts";
import { bridgeFetch } from "../lib/bridge.ts";
import {
  canvasBytes,
  downloadBytes,
  downloadCanvas,
  downloadText,
} from "../lib/editor-helpers.ts";

type UseExportActionsParams = {
  project: Project;
  frame: Frame;
  frameIndex: number;
};

export function useExportActions({
  project,
  frame,
  frameIndex,
}: UseExportActionsParams) {
  function recordExport(kind: string, filename: string, contentType: string) {
    void bridgeFetch("/api/export/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, filename, contentType }),
    }).catch(() => undefined);
  }

  function exportPng() {
    const filename = `${slug(project.godot.asset)}_${slug(project.godot.animation)}_f${frameIndex + 1}.png`;
    downloadCanvas(
      filename,
      renderFrameFresh(frame, project.background),
    );
    recordExport("png", filename, "image/png");
  }

  function spritesheetCanvas(projectInput: Project) {
    const sheet = document.createElement("canvas");
    sheet.width = SIZE * projectInput.frames.length;
    sheet.height = SIZE;
    const ctx = sheet.getContext("2d");
    if (!ctx) return sheet;
    ctx.imageSmoothingEnabled = false;
    projectInput.frames.forEach((item, index) =>
      ctx.drawImage(renderFrameFresh(item, projectInput.background), index * SIZE, 0),
    );
    return sheet;
  }

  function assetSpritesheetCanvas(projectInput: Project) {
    const asset = activeAssetOf(projectInput);
    const columns = Math.max(
      1,
      ...asset.animations.map((animation) => animation.frames.length),
    );
    const sheet = document.createElement("canvas");
    sheet.width = SIZE * columns;
    sheet.height = SIZE * asset.animations.length;
    const ctx = sheet.getContext("2d");
    if (!ctx) return sheet;
    ctx.imageSmoothingEnabled = false;
    asset.animations.forEach((animation, row) =>
      animation.frames.forEach((item, column) =>
        ctx.drawImage(
          renderFrameFresh(item, projectInput.background),
          column * SIZE,
          row * SIZE,
        ),
      ),
    );
    return sheet;
  }

  function exportSpritesheet() {
    const filename = `${slug(project.godot.asset)}_${slug(project.godot.animation)}_sheet.png`;
    downloadCanvas(
      filename,
      spritesheetCanvas(project),
    );
    recordExport("spritesheet", filename, "image/png");
  }

  async function exportWebp() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}_sheet.webp`;
    downloadBytes(
      filename,
      await canvasBytes(spritesheetCanvas(project), "image/webp"),
      "image/webp",
    );
    recordExport("webp", filename, "image/webp");
  }

  function exportGif() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}.gif`;
    downloadBytes(
      filename,
      encodeGifFromProject(project),
      "image/gif",
    );
    recordExport("gif", filename, "image/gif");
  }

  async function exportZip() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const zip = encodeZip([
      {
        name: `png/${asset}_${animation}_f${frameIndex + 1}.png`,
        data: await canvasBytes(renderFrameFresh(frame, project.background)),
      },
      {
        name: `png/${asset}_${animation}_sheet.png`,
        data: await canvasBytes(spritesheetCanvas(project)),
      },
      {
        name: `png/${asset}_sheet.png`,
        data: await canvasBytes(assetSpritesheetCanvas(project)),
      },
      ...professionalMetadataFiles(project),
    ]);
    const filename = `${asset}_${animation}_export.zip`;
    downloadBytes(filename, zip, "application/zip");
    recordExport("zip", filename, "application/zip");
  }

  function exportAsepriteJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}.aseprite.json`;
    downloadText(
      filename,
      JSON.stringify(asepriteJson(project), null, 2),
    );
    recordExport("aseprite", filename, "application/json");
  }

  function exportTilemapJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}.tilemap.json`;
    downloadText(
      filename,
      JSON.stringify(tilemapMetadata(project), null, 2),
    );
    recordExport("tilemap", filename, "application/json");
  }

  function exportAtlasJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}.atlas.json`;
    downloadText(
      filename,
      JSON.stringify(atlasMetadata(project), null, 2),
    );
    recordExport("atlas", filename, "application/json");
  }

  function exportGodotJson() {
    const asset = slug(project.godot.asset);
    const filename = `${asset}.animations.json`;
    downloadText(
      filename,
      JSON.stringify(godotMetadata(project), null, 2),
    );
    recordExport("godot", filename, "application/json");
  }

  function exportUnityJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}.unity.json`;
    downloadText(
      filename,
      JSON.stringify(unityMetadata(project), null, 2),
    );
    recordExport("unity", filename, "application/json");
  }

  function saveJson() {
    const filename = "pixel-project.json";
    downloadText(filename, JSON.stringify(project, null, 2));
    recordExport("project", filename, "application/json");
  }

  return {
    exportPng,
    exportSpritesheet,
    exportGif,
    exportWebp,
    exportZip,
    exportAsepriteJson,
    exportTilemapJson,
    exportAtlasJson,
    exportGodotJson,
    exportUnityJson,
    saveJson,
  };
}
