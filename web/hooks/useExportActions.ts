import { useState } from "react";
import {
  activeAssetOf,
  atlasMetadata,
  compareRenderedFrame,
  godotMetadata,
  qualityReport,
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
  const [exportQaStatus, setExportQaStatus] = useState<{
    kind: string;
    blocked: boolean;
    message: string;
    mismatchedPixels: number;
  } | null>(null);

  function preflight(kind: string, engine: "godot" | "unity" | "generic" = "godot") {
    const asset = activeAssetOf(project);
    const profile = asset.exportProfiles.find((item) => item.engine === engine) || asset.exportProfiles[0];
    const report = qualityReport(project, profile);
    const canvas = renderFrameFresh(frame, project.background);
    const context = canvas.getContext("2d");
    const parity = context
      ? compareRenderedFrame(
          frame,
          project.background,
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        )
      : { matches: false, dimensionsMatch: false, mismatchedPixels: SIZE * SIZE };
    const blocked = !parity.matches || !report.canExport;
    const message = !parity.matches
      ? `Export bloqueado: PNG diverge do projeto em ${parity.mismatchedPixels} pixel(s).`
      : blocked
        ? `Export bloqueado pelo perfil: ${report.errors.length} erro(s) de QA.`
        : report.issues.length
          ? `QA concluído: export permitido com ${report.issues.length} alerta(s).`
          : "QA concluído: pixels do projeto e PNG são idênticos.";
    setExportQaStatus({ kind, blocked, message, mismatchedPixels: parity.mismatchedPixels });
    return !blocked;
  }

  function recordExport(kind: string, filename: string, contentType: string) {
    void bridgeFetch("/api/export/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, filename, contentType }),
    }).catch(() => undefined);
  }

  function exportPng() {
    if (!preflight("PNG")) return;
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
    if (!preflight("Spritesheet")) return;
    const filename = `${slug(project.godot.asset)}_${slug(project.godot.animation)}_sheet.png`;
    downloadCanvas(
      filename,
      spritesheetCanvas(project),
    );
    recordExport("spritesheet", filename, "image/png");
  }

  async function exportWebp() {
    if (!preflight("WebP")) return;
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
    if (!preflight("GIF")) return;
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
    if (!preflight("ZIP")) return;
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
    if (!preflight("Aseprite JSON", "generic")) return;
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
    if (!preflight("Tilemap JSON", "generic")) return;
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
    if (!preflight("Atlas JSON")) return;
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
    if (!preflight("Godot JSON", "godot")) return;
    const asset = slug(project.godot.asset);
    const filename = `${asset}.animations.json`;
    downloadText(
      filename,
      JSON.stringify(godotMetadata(project), null, 2),
    );
    recordExport("godot", filename, "application/json");
  }

  function exportUnityJson() {
    if (!preflight("Unity JSON", "unity")) return;
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
    exportQaStatus,
  };
}
