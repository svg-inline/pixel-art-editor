import { useState } from "react";
import {
  atlasMetadata,
  compareRenderedFrame,
  godotMetadata,
  qualityReport,
  SIZE,
  slug,
  spritesheetPlan,
  exportProfileOf,
  validateExportProfile,
  unityMetadata,
} from "../../shared/pixel-core.ts";
import type { ExportPresetId, Frame, Project } from "../../shared/pixel-core.ts";
import {
  asepriteJson,
  encodeGifFromProject,
  encodeZip,
  exportPackageFiles,
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

  function preflight(kind: string, preset: ExportPresetId = "generic_png") {
    const profile = exportProfileOf(project, preset);
    const validation = validateExportProfile(project, profile);
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
    const blocked = !validation.valid || !parity.matches || !report.canExport;
    const message = !parity.matches
      ? `Export bloqueado: PNG diverge do projeto em ${parity.mismatchedPixels} pixel(s).`
      : !validation.valid
        ? `Export bloqueado: ${validation.issues.join(" ")}`
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
    if (!preflight("PNG", "generic_png")) return;
    const profile = exportProfileOf(project, "generic_png");
    const source = renderFrameFresh(frame, profile.background.mode === "project" ? project.background : {
      mode: profile.background.mode === "color" ? "color" : "transparent",
      color: profile.background.color,
    });
    const placement = spritesheetPlan(project, profile).frames.find((item) => item.frame.id === frame.id);
    const crop = placement?.source || profile.crop || { x: 0, y: 0, w: SIZE, h: SIZE };
    const output = document.createElement("canvas");
    output.width = crop.w * profile.scale + profile.padding * 2;
    output.height = crop.h * profile.scale + profile.padding * 2;
    const context = output.getContext("2d");
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(source, crop.x, crop.y, crop.w, crop.h, profile.padding, profile.padding, crop.w * profile.scale, crop.h * profile.scale);
    }
    const filename = `${slug(project.godot.asset)}_${slug(project.godot.animation)}_f${frameIndex + 1}.png`;
    downloadCanvas(
      filename,
      output,
    );
    recordExport("png", filename, "image/png");
  }

  function spritesheetCanvas(projectInput: Project, preset: ExportPresetId = "spritesheet_grid") {
    const plan = spritesheetPlan(projectInput, preset);
    const sheet = document.createElement("canvas");
    sheet.width = plan.width;
    sheet.height = plan.height;
    const ctx = sheet.getContext("2d");
    if (!ctx) return sheet;
    ctx.imageSmoothingEnabled = false;
    plan.frames.forEach((item) => {
      const source = renderFrameFresh(item.frame, plan.background);
      ctx.drawImage(source, item.source.x, item.source.y, item.source.w, item.source.h,
        item.destination.x, item.destination.y, item.destination.w, item.destination.h);
    });
    return sheet;
  }

  function exportSpritesheet() {
    if (!preflight("Spritesheet", "spritesheet_grid")) return;
    const filename = `${slug(project.godot.asset)}_${slug(project.godot.animation)}_sheet.png`;
    downloadCanvas(
      filename,
      spritesheetCanvas(project),
    );
    recordExport("spritesheet", filename, "image/png");
  }

  async function exportWebp() {
    if (!preflight("WebP", "web_preview")) return;
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const filename = `${asset}_${animation}_sheet.webp`;
    downloadBytes(
      filename,
      await canvasBytes(spritesheetCanvas(project, "web_preview"), "image/webp"),
      "image/webp",
    );
    recordExport("webp", filename, "image/webp");
  }

  function exportGif() {
    if (!preflight("GIF", "web_preview")) return;
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

  async function exportZip(preset: ExportPresetId = "godot_4") {
    if (!preflight("ZIP", preset)) return;
    const asset = slug(project.godot.asset);
    const animation = slug(project.godot.animation);
    const png = await canvasBytes(spritesheetCanvas(project, preset));
    const zip = encodeZip(exportPackageFiles(project, preset, png));
    const filename = `${asset}_${animation}_export.zip`;
    downloadBytes(filename, zip, "application/zip");
    recordExport("zip", filename, "application/zip");
  }

  function exportAsepriteJson() {
    if (!preflight("Aseprite JSON", "aseprite_json")) return;
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
    if (!preflight("Tilemap JSON", "spritesheet_grid")) return;
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
    if (!preflight("Atlas JSON", "spritesheet_grid")) return;
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
    if (!preflight("Godot JSON", "godot_4")) return;
    const asset = slug(project.godot.asset);
    const filename = `${asset}.animations.json`;
    downloadText(
      filename,
      JSON.stringify(godotMetadata(project), null, 2),
    );
    recordExport("godot", filename, "application/json");
  }

  function exportUnityJson() {
    if (!preflight("Unity JSON", "unity_2d")) return;
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
