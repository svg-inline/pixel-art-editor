import {
  activeAssetOf,
  activeFrameOf,
  blankFrame,
  blankLayer,
  syncActiveAnimationMeta,
  uid,
} from "../../shared/pixel-core.ts";
import type {
  BoxKind,
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
    }, true, "layer.add");
  }

  function removeLayer(id: string) {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      if (activeFrame.layers.length === 1) return;
      activeFrame.layers = activeFrame.layers.filter((layer) => layer.id !== id);
      activeFrame.activeLayerId = activeFrame.layers[0].id;
    }, true, "layer.remove", { layerId: id });
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
    }, true, "project.change", {
      operation: "layer.move",
      from: index,
      to: index + direction,
    });
  }

  function updateLayer(index: number, mutator: (layer: Layer) => void) {
    updateProject((draft) => {
      const activeFrame = activeFrameOf(draft);
      mutator(activeFrame.layers[index]);
    }, false);
  }

  function updateActiveFrame(mutator: (frame: Frame) => void) {
    updateProject((draft) => {
      mutator(activeFrameOf(draft));
    });
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

  function addAnimation() {
    updateProject((draft) => {
      const asset = activeAssetOf(draft);
      const direction = draft.godot.direction;
      const firstFrame = blankFrame(`Frame 1`);
      const animation = {
        id: uid(),
        name: `anim_${asset.animations.length + 1}_${direction.toLowerCase()}`,
        direction,
        fps: draft.godot.fps,
        loop: draft.godot.loop,
        frames: [firstFrame],
      };
      asset.animations.push(animation);
      draft.activeAnimationId = animation.id;
      draft.activeFrameId = firstFrame.id;
    }, true, "project.change", { operation: "animation.add" });
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
    }, true, "frame.add");
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
    }, true, "frame.duplicate");
  }

  function removeFrame(id: string) {
    updateProject((draft) => {
      if (draft.frames.length === 1) return;
      draft.frames = draft.frames.filter((item) => item.id !== id);
      draft.activeFrameId = draft.frames[0].id;
    }, true, "frame.remove", { frameId: id });
  }

  function moveFrame(index: number, direction: number) {
    updateProject((draft) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= draft.frames.length) return;
      [draft.frames[index], draft.frames[targetIndex]] = [
        draft.frames[targetIndex],
        draft.frames[index],
      ];
    }, true, "frame.move", { from: index, to: index + direction });
  }

  return {
    addLayer,
    removeLayer,
    moveLayer,
    updateLayer,
    updateActiveFrame,
    addFrameBox,
    setActiveAsset,
    setActiveAnimation,
    addAnimation,
    setGodotField,
    setBackgroundField,
    addFrame,
    duplicateFrame,
    removeFrame,
    moveFrame,
  };
}
