import assert from "node:assert/strict";
import test from "node:test";
import { gridStepForZoom } from "../web/lib/editor-helpers.ts";
import { shortcutToolForKey } from "../web/hooks/useKeyboardShortcuts.ts";

test("keyboard shortcut mapping keeps editor tool hotkeys stable", () => {
  assert.equal(shortcutToolForKey("b"), "pencil");
  assert.equal(shortcutToolForKey("E"), "eraser");
  assert.equal(shortcutToolForKey("g"), "bucket");
  assert.equal(shortcutToolForKey("x"), null);
});

test("automatic grid density picks stable pixel steps for zoom levels", () => {
  assert.equal(gridStepForZoom(1, "normal"), 32);
  assert.equal(gridStepForZoom(3, "normal"), 16);
  assert.equal(gridStepForZoom(3, "compacta"), 8);
  assert.equal(gridStepForZoom(6, "limpa"), 8);
});
