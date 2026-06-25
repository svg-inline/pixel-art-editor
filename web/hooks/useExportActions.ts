import {
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
  function exportPng() {
    downloadCanvas(
      `${slug(project.godot.asset)}_${slug(project.godot.animation)}_f${frameIndex + 1}.png`,
      renderFrameFresh(frame, project.background),
    );
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

  function exportSpritesheet() {
    downloadCanvas(
      `${slug(project.godot.asset)}_${slug(project.godot.animation)}_sheet.png`,
      spritesheetCanvas(project),
    );
  }

  async function exportWebp() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadBytes(
      `${asset}_${animation}_sheet.webp`,
      await canvasBytes(spritesheetCanvas(project), "image/webp"),
      "image/webp",
    );
  }

  function exportGif() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadBytes(
      `${asset}_${animation}.gif`,
      encodeGifFromProject(project),
      "image/gif",
    );
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
      ...professionalMetadataFiles(project),
    ]);
    downloadBytes(`${asset}_${animation}_export.zip`, zip, "application/zip");
  }

  function exportAsepriteJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadText(
      `${asset}_${animation}.aseprite.json`,
      JSON.stringify(asepriteJson(project), null, 2),
    );
  }

  function exportTilemapJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadText(
      `${asset}_${animation}.tilemap.json`,
      JSON.stringify(tilemapMetadata(project), null, 2),
    );
  }

  function exportAtlasJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadText(
      `${asset}_${animation}.atlas.json`,
      JSON.stringify(atlasMetadata(project), null, 2),
    );
  }

  function exportGodotJson() {
    const asset = slug(project.godot.asset);
    downloadText(
      `${asset}.animations.json`,
      JSON.stringify(godotMetadata(project), null, 2),
    );
  }

  function exportUnityJson() {
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    downloadText(
      `${asset}_${animation}.unity.json`,
      JSON.stringify(unityMetadata(project), null, 2),
    );
  }

  function saveJson() {
    downloadText("pixel-project.json", JSON.stringify(project, null, 2));
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
