import {
  activeAnimationOf,
  activeAssetOf,
  activeFrameOf,
  blankFrame,
  blankLayer,
  cropFrameToBounds,
  mergeLayerDown,
  normalizeExportProfiles,
  resizeFrameContent,
  syncActiveAnimationMeta,
  uid,
} from "../../shared/pixel-core.ts";
import type {
  BoxKind,
  Direction,
  ExportProfile,
  Frame,
  Layer,
  Project,
  ProjectBackground,
} from "../../shared/pixel-core.ts";
import type { HistoryCommandName } from "../../shared/history.ts";
import { activeFrameIndex, cloneProject } from "../lib/editor-helpers.ts";

type UpdateProject = (
  mutator: (project: Project) => Project | void,
  saveHist?: boolean,
  historyType?: HistoryCommandName,
  params?: Record<string, unknown>,
) => void;

type UseProjectActionsParams = {
  updateProject: UpdateProject;
};

export function useProjectActions({ updateProject }: UseProjectActionsParams) {
  function addLayer() {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      const layer = blankLayer(`Layer ${activeFrame.layers.length + 1}`);
      activeFrame.layers.push(layer);
      activeFrame.activeLayerId = layer.id;
    }, true, "create_layer");
  }

  function removeLayer(id: string) {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      if (activeFrame.layers.length === 1) return;
      if (activeFrame.layers.find((layer) => layer.id === id)?.locked) return;
      activeFrame.layers = activeFrame.layers.filter((layer) => layer.id !== id);
      activeFrame.activeLayerId = activeFrame.layers[0].id;
    }, true, "delete_layer", { layerId: id });
  }

  function moveLayer(index: number, direction: number) {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= activeFrame.layers.length) return;
      [activeFrame.layers[index], activeFrame.layers[targetIndex]] = [
        activeFrame.layers[targetIndex],
        activeFrame.layers[index],
      ];
    }, true, "layer_change", {
      operation: "layer.move",
      from: index,
      to: index + direction,
    });
  }

  function mergeDown(index: number) {
    updateProject(
      (draft) => {
        mergeLayerDown(activeFrameOf(draft), index);
      },
      true,
      "layer_change",
      { operation: "layer.mergeDown", index },
    );
  }

  function updateLayer(index: number, mutator: (layer: Layer) => void) {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      mutator(activeFrame.layers[index]);
    }, true, "layer_change", { operation: "layer.update", index });
  }

  function updateActiveFrame(mutator: (frame: Frame) => void) {
    updateProject(
      (draft) => {
        mutator(activeFrameOf(draft));
      },
      true,
      "frame_change",
    );
  }

  function resizeCanvasContent(width: number, height: number) {
    updateProject(
      (draft) => {
        resizeFrameContent(activeFrameOf(draft), width, height);
      },
      true,
      "project.change",
      { operation: "canvas.resizeContent", width, height },
    );
  }

  function cropCanvasToBounds() {
    updateProject(
      (draft) => {
        cropFrameToBounds(activeFrameOf(draft));
      },
      true,
      "project.change",
      { operation: "canvas.cropToBounds" },
    );
  }

  function addFrameBox(kind: BoxKind) {
    updateActiveFrame((activeFrame) => {
      activeFrame.hitboxes.push({
        id: uid(),
        name: kind,
        kind,
        x: Math.max(0, Math.floor(activeFrame.pivot.x) - 16),
        y: Math.max(0, Math.floor(activeFrame.pivot.y) - 16),
        w: 32,
        h: 32,
      });
    });
  }

  function setActiveAsset(id: string) {
    updateProject((draft) => {
      const asset = draft.assets.find((item) => item.id === id);
      if (!asset) return;
      draft.activeAssetId = asset.id;
      draft.activeAnimationId = asset.animations[0].id;
      draft.activeFrameId = asset.animations[0].frames[0]?.id || "";
    }, false);
  }

  function setActiveAnimation(id: string) {
    updateProject((draft) => {
      const asset = activeAssetOf(draft);
      const animation = asset.animations.find((item) => item.id === id);
      if (!animation) return;
      draft.activeAnimationId = animation.id;
      draft.activeFrameId = animation.frames[0]?.id || "";
    }, false);
  }

  function addAsset() {
    updateProject((draft) => {
      const assetNumber = draft.assets.length + 1;
      const direction: Direction = "S";
      const makeAnimation = (name: string, fps: number, loop: boolean) => ({
        id: uid(),
        name,
        direction,
        fps,
        loop,
        pivot: { x: 128, y: 128 },
        pivotExplicit: false,
        frames: [blankFrame("Frame 1")],
      });
      const animations = [
        makeAnimation("idle", 6, true),
        makeAnimation("walk", 8, true),
        makeAnimation("attack", 10, false),
      ];
      const asset = {
        id: uid(),
        name: `Asset ${assetNumber}`,
        palette: [...draft.palette],
        animations,
        exportProfiles: normalizeExportProfiles(undefined),
      };
      draft.assets.push(asset);
      draft.activeAssetId = asset.id;
      draft.activeAnimationId = animations[0].id;
      draft.activeFrameId = animations[0].frames[0].id;
    }, true, "project.change", { operation: "asset.add" });
  }

  function addAnimation(name?: string) {
    updateProject((draft) => {
      const asset = activeAssetOf(draft);
      const direction = draft.godot.direction;
      const firstFrame = blankFrame(`Frame 1`);
      const baseName = String(name || `animation ${asset.animations.length + 1}`);
      const duplicateCount = asset.animations.filter(
        (item) => item.name === baseName || item.name.startsWith(`${baseName} `),
      ).length;
      const animation = {
        id: uid(),
        name: duplicateCount ? `${baseName} ${duplicateCount + 1}` : baseName,
        direction,
        fps: draft.godot.fps,
        loop: draft.godot.loop,
        pivot: { ...activeAnimationOf(draft).pivot },
        pivotExplicit: activeAnimationOf(draft).pivotExplicit,
        frames: [firstFrame],
      };
      asset.animations.push(animation);
      draft.activeAnimationId = animation.id;
      draft.activeFrameId = firstFrame.id;
    }, true, "project.change", { operation: "animation.add" });
  }

  function setAnimationPivot(axis: "x" | "y", value: number) {
    updateProject((draft) => {
      const animation = activeAnimationOf(draft);
      animation.pivot[axis] = Math.max(0, Math.min(255, value));
      animation.pivotExplicit = true;
    }, false);
  }

  function setExportProfileField(
    profileId: string,
    key: keyof ExportProfile,
    value: ExportProfile[keyof ExportProfile],
  ) {
    updateProject((draft) => {
      const asset = activeAssetOf(draft);
      const profile = asset.exportProfiles.find((item) => item.id === profileId || item.preset === profileId);
      if (!profile) return;
      if (key === "pixelsPerUnit") profile.pixelsPerUnit = Math.max(1, Number(value) || 1);
      else if (key === "scale") profile.scale = Math.max(1, Math.min(16, Math.floor(Number(value) || 1)));
      else if (key === "padding" || key === "spacing") profile[key] = Math.max(0, Math.min(256, Math.floor(Number(value) || 0)));
      else if (key === "maxColors") profile.maxColors = Math.max(2, Math.min(256, Number(value) || 2));
      else if (key === "minMargin") profile.minMargin = Math.max(0, Math.min(64, Number(value) || 0));
      else if (key === "centerTolerance") profile.centerTolerance = Math.max(0, Math.min(128, Number(value) || 0));
      else if (key === "requiredBoxes") profile.requiredBoxes = value as BoxKind[];
      else if (key === "directions") profile.directions = value as ExportProfile["directions"];
      else if (key === "scope") profile.scope = value === "all_animations" ? "all_animations" : "active_animation";
      else if (key === "background") profile.background = value as ExportProfile["background"];
      else if (key === "crop") profile.crop = value as ExportProfile["crop"];
      else if (key === "qaMode") profile.qaMode = value === "block" ? "block" : "warning";
      else if (key === "trim" || key === "binaryAlpha" || key === "requirePivot") profile[key] = Boolean(value);
    }, false);
  }

  function setGodotField(
    key: keyof Project["godot"],
    value: Project["godot"][keyof Project["godot"]],
  ) {
    updateProject((draft) => {
      draft.godot = { ...draft.godot, [key]: value };
      syncActiveAnimationMeta(draft);
    }, false);
  }

  function setBackgroundField(
    key: keyof ProjectBackground,
    value: ProjectBackground[keyof ProjectBackground],
  ) {
    updateProject((draft) => {
      draft.background = {
        ...(draft.background || { mode: "transparent", color: "#0f172a" }),
        [key]: value,
      };
    }, false);
  }

  function addFrame() {
    updateProject((draft) => {
      const nextFrame = blankFrame(`Frame ${draft.frames.length + 1}`);
      draft.frames.push(nextFrame);
      draft.activeFrameId = nextFrame.id;
    }, true, "create_frame");
  }

  function duplicateFrame() {
    updateProject((draft) => {
      const duplicated = cloneProject(activeFrameOf(draft));
      duplicated.id = uid();
      duplicated.name = `${duplicated.name} copy`;
      duplicated.layers.forEach((layer) => (layer.id = uid()));
      duplicated.activeLayerId = duplicated.layers[0].id;
      draft.frames.splice(activeFrameIndex(draft) + 1, 0, duplicated);
      draft.activeFrameId = duplicated.id;
    }, true, "create_frame", { operation: "frame.duplicate" });
  }

  function removeFrame(id: string) {
    updateProject((draft) => {
      if (draft.frames.length === 1) return;
      draft.frames = draft.frames.filter((item) => item.id !== id);
      draft.activeFrameId = draft.frames[0].id;
    }, true, "delete_frame", { frameId: id });
  }

  function moveFrame(index: number, direction: number) {
    updateProject((draft) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= draft.frames.length) return;
      [draft.frames[index], draft.frames[targetIndex]] = [
        draft.frames[targetIndex],
        draft.frames[index],
      ];
    }, true, "frame_change", { operation: "frame.move", from: index, to: index + direction });
  }

  return {
    addLayer,
    removeLayer,
    moveLayer,
    mergeDown,
    updateLayer,
    updateActiveFrame,
    resizeCanvasContent,
    cropCanvasToBounds,
    addFrameBox,
    setActiveAsset,
    setActiveAnimation,
    addAsset,
    addAnimation,
    setAnimationPivot,
    setExportProfileField,
    setGodotField,
    setBackgroundField,
    addFrame,
    duplicateFrame,
    removeFrame,
    moveFrame,
  };
}
