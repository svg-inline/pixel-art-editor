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
};

export function shortcutToolForKey(key: string) {
  return KEY_TO_TOOL[key.toLowerCase()] || null;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return (
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
        setZoom((value) => clamp(value + 1, 1, 8));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => clamp(value - 1, 1, 8));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onUndo, onRedo, setTool, setZoom]);
}
