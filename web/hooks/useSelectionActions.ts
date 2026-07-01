import type { ChangeEvent, MutableRefObject } from "react";
import {
  activeAssetOf,
  activeFrameOf,
  activeLayerOf,
  limitColors as limitProjectColors,
  normalizeProject,
  replaceGlobalColor as replaceProjectColor,
  rotate90Selection,
  selectionContains,
  selectionBounds,
  setPixel,
} from "../../shared/pixel-core.ts";
import type { Frame, Project, Selection } from "../../shared/pixel-core.ts";
import { projectFromAsepriteJson } from "../../shared/pro-export.ts";
import type { HistoryCommandName } from "../../shared/history.ts";
import {
  downloadText,
  eraseClipPixels,
  getSelectionPixels,
  pastePixels,
  readJsonFile,
} from "../lib/editor-helpers.ts";
import type { Clip } from "../types.ts";

type UpdateProject = (
  mutator: (project: Project) => Project | void,
  saveHist?: boolean,
  historyType?: HistoryCommandName,
  params?: Record<string, unknown>,
) => void;

type UseSelectionActionsParams = {
  project: Project;
  projectRef: MutableRefObject<Project>;
  frame: Frame;
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  clipboard: Clip | null;
  setClipboard: (clip: Clip | null) => void;
  color: string;
  replaceFrom: string;
  replaceTo: string;
  maxColors: number;
  updateProject: UpdateProject;
  commitHistory: (
    before: Project | null,
    after: Project,
    type?: HistoryCommandName,
    params?: Record<string, unknown>,
  ) => void;
  markDirty: () => void;
  setProject: (project: Project) => void;
};

export function useSelectionActions({
  project,
  projectRef,
  frame,
  selection,
  setSelection,
  clipboard,
  setClipboard,
  color,
  replaceFrom,
  replaceTo,
  maxColors,
  updateProject,
  commitHistory,
  markDirty,
  setProject,
}: UseSelectionActionsParams) {
  function copySelection(cut = false) {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    setClipboard(clip);
    if (cut)
      updateProject((draft) => {
        const layer = activeLayerOf(activeFrameOf(draft));
        if (layer.locked) return;
        for (let y = 0; y < clip.h; y++)
          for (let x = 0; x < clip.w; x++) {
            const relativeIndex = y * clip.w + x;
            if (clip.selected && !clip.selected[relativeIndex]) continue;
            setPixel(layer, clip.x + x, clip.y + y, null);
          }
      }, true, "erase_pixel", { operation: "selection.cut" });
  }

  function pasteSelection() {
    if (!clipboard) return;
    const bounds = selectionBounds(selection) || {
      x: clipboard.x,
      y: clipboard.y,
    };
    updateProject(
      (draft) =>
        pastePixels(
          activeLayerOf(activeFrameOf(draft)),
          clipboard,
          bounds.x,
          bounds.y,
        ),
      true,
      "transform_selection",
      { operation: "selection.paste" },
    );
    setSelection({
      x: bounds.x,
      y: bounds.y,
      w: clipboard.w - 1,
      h: clipboard.h - 1,
    });
  }

  function moveSelection(dx: number, dy: number) {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    updateProject(
      (draft) =>
        pastePixels(
          activeLayerOf(activeFrameOf(draft)),
          clip,
          clip.x + dx,
          clip.y + dy,
          true,
        ),
      true,
      "move_selection",
      { dx, dy },
    );
    setSelection({
      x: clip.x + dx,
      y: clip.y + dy,
      w: clip.w - 1,
      h: clip.h - 1,
    });
  }

  function transformSelection(kind: "mirrorH" | "mirrorV" | "rotate90") {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    let nextClip: Clip;
    if (kind === "rotate90") {
      nextClip = rotate90Selection(clip);
    } else {
      const pixels = new Array(clip.pixels.length).fill(null);
      const selected = clip.selected
        ? new Array<boolean>(clip.selected.length).fill(false)
        : undefined;
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++) {
          const targetIndex =
            kind === "mirrorH"
              ? y * clip.w + (clip.w - 1 - x)
              : (clip.h - 1 - y) * clip.w + x;
          pixels[targetIndex] = clip.pixels[y * clip.w + x];
          if (selected)
            selected[targetIndex] = Boolean(clip.selected?.[y * clip.w + x]);
        }
      nextClip = { ...clip, pixels, selected };
    }
    updateProject(
      (draft) => {
        const layer = activeLayerOf(activeFrameOf(draft));
        eraseClipPixels(layer, clip);
        pastePixels(layer, nextClip, clip.x, clip.y);
      },
      true,
      kind === "rotate90" ? "rotate_selection" : "transform_selection",
      { operation: kind },
    );
    setSelection({
      x: clip.x,
      y: clip.y,
      w: nextClip.w - 1,
      h: nextClip.h - 1,
    });
  }

  function applyDitherToSelection() {
    const bounds = selectionBounds(selection);
    if (!bounds) return;
    updateProject((draft) => {
      const layer = activeLayerOf(activeFrameOf(draft));
      if (layer.locked) return;
      for (let y = 0; y < bounds.h; y++)
        for (let x = 0; x < bounds.w; x++)
          if (
            (x + y) % 2 === 0 &&
            selectionContains(selection, bounds.x + x, bounds.y + y)
          )
            setPixel(layer, bounds.x + x, bounds.y + y, color);
    });
  }

  function replaceGlobalColor() {
    updateProject((draft) => replaceProjectColor(draft, replaceFrom, replaceTo));
  }

  function limitColorsNow() {
    updateProject((draft) => limitProjectColors(draft, maxColors));
  }

  function importPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const colors = text.trim().startsWith("[")
        ? JSON.parse(text)
        : text.match(/#[0-9a-fA-F]{6}/g);
      if (Array.isArray(colors) && colors.length)
        updateProject((draft) => {
          draft.palette = [
            ...new Set(colors.map((item) => String(item).toLowerCase())),
          ];
          activeAssetOf(draft).palette = draft.palette;
        }, false);
    });
  }

  function loadJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    readJsonFile(file).then((json) => {
      const before = projectRef.current;
      const next = normalizeProject(projectFromAsepriteJson(json) || json);
      commitHistory(before, next, "import_asset", { source: "json" });
      markDirty();
      projectRef.current = next;
      setProject(next);
    });
  }

  function exportPalette() {
    downloadText("palette.json", JSON.stringify(project.palette, null, 2));
  }

  return {
    copySelection,
    pasteSelection,
    moveSelection,
    transformSelection,
    applyDitherToSelection,
    replaceGlobalColor,
    limitColorsNow,
    importPalette,
    loadJson,
    exportPalette,
  };
}
