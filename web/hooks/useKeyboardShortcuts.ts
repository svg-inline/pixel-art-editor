import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { clamp } from "../../shared/pixel-core.ts";
import type { Tool } from "../types.ts";

const KEY_TO_TOOL: Record<string, Tool> = {
  b: "pencil",
  e: "eraser",
  g: "bucket",
  i: "picker",
  m: "select",
  d: "dither",
  l: "line",
  r: "rect",
  o: "ellipse",
  w: "wand",
  q: "lasso",
};

export const EDITOR_SHORTCUTS = [
  ["B", "Lápis"],
  ["E", "Borracha"],
  ["G", "Balde"],
  ["I", "Conta-gotas"],
  ["M", "Seleção retangular"],
  ["W", "Varinha mágica contígua"],
  ["Q", "Laço livre"],
  ["D", "Dither"],
  ["L / R / O", "Linha / retângulo / elipse"],
  ["+ / −", "Aumentar / reduzir zoom"],
  ["0", "Zoom 100%"],
  ["Espaço + arrastar", "Pan do canvas"],
  ["Botão do meio + arrastar", "Pan do canvas"],
  ["Roda do mouse", "Zoom centrado no cursor"],
  ["Ctrl+Z", "Desfazer"],
  ["Ctrl+Y / Ctrl+Shift+Z", "Refazer"],
] as const;

export function shortcutToolForKey(key: string) {
  return KEY_TO_TOOL[key.toLowerCase()] || null;
}

export function shortcutKeyForTool(tool: Tool) {
  return (
    Object.entries(KEY_TO_TOOL).find(([, mappedTool]) => mappedTool === tool)?.[0]
      ?.toUpperCase() || null
  );
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return (
    element?.isContentEditable ||
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    element?.tagName === "SELECT"
  );
}

type UseKeyboardShortcutsParams = {
  onUndo: () => void;
  onRedo: () => void;
  setTool: (tool: Tool) => void;
  setZoom: Dispatch<SetStateAction<number>>;
};

export function useKeyboardShortcuts({
  onUndo,
  onRedo,
  setTool,
  setZoom,
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        onUndo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      const nextTool = shortcutToolForKey(event.key);
      if (nextTool) {
        event.preventDefault();
        setTool(nextTool);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => clamp(value + 1, 1, 16));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => clamp(value - 1, 1, 16));
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onUndo, onRedo, setTool, setZoom]);
}
