import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAnimationOf,
  activeFrameOf,
  activeLayerOf,
  compareRenderedFrame,
  compositeFrameRgba,
  expandProject,
  indexOf,
  qualityReport,
  setPixel,
  SIZE,
} from "../shared/pixel-core.ts";

function paintedProject(points: Array<[number, number, string]>) {
  const project = expandProject({ background: { mode: "transparent", color: "#000000" } });
  const frame = activeFrameOf(project);
  const layer = activeLayerOf(frame);
  for (const [x, y, color] of points) setPixel(layer, x, y, color);
  activeAnimationOf(project).pivotExplicit = true;
  return project;
}

test("QA detects a painted false transparency checker without counting UI transparency", () => {
  const project = paintedProject([
    [10, 10, "#dddddd"], [11, 10, "#cccccc"],
    [10, 11, "#cccccc"], [11, 11, "#dddddd"],
  ]);
  const report = qualityReport(project, { requirePivot: false });

  assert.equal(report.falseCheckerboardPixels, 4);
  assert.ok(report.warnings.includes("false_checkerboard_pixels"));
  assert.ok(report.transparentPixels > 0);
});

test("QA reports real transparency and rejects partial alpha for binary profiles", () => {
  const project = paintedProject([[20, 20, "#ff0000"]]);
  activeLayerOf(activeFrameOf(project)).opacity = 0.5;
  const report = qualityReport(project, { binaryAlpha: true, requirePivot: false });

  assert.equal(report.partialAlphaPixels, 1);
  assert.equal(report.hasRealTransparency, true);
  assert.ok(report.errors.some((issue) => issue.code === "partial_alpha"));
});

test("QA counts visible colors per frame and enforces the profile limit", () => {
  const project = paintedProject([
    [30, 30, "#ff0000"], [31, 30, "#00ff00"], [32, 30, "#0000ff"],
  ]);
  const report = qualityReport(project, { maxColors: 2, requirePivot: false });

  assert.equal(report.colors, 3);
  assert.equal(report.frameReports[0].colors, 3);
  assert.ok(report.warnings.includes("palette_over_limit"));
});

test("QA calculates frame bounds, center offset and unsafe atlas margin", () => {
  const project = paintedProject([[0, 100, "#ff00ff"], [1, 101, "#ff00ff"]]);
  const report = qualityReport(project, { minMargin: 2, centerTolerance: 10, requirePivot: false });
  const frame = report.frameReports[0];

  assert.deepEqual(frame.bounds && { x: frame.bounds.x, y: frame.bounds.y, w: frame.bounds.w, h: frame.bounds.h }, { x: 0, y: 100, w: 2, h: 2 });
  assert.equal(frame.bounds?.margin.min, 0);
  assert.ok(report.warnings.includes("insufficient_margin"));
  assert.ok(report.warnings.includes("object_off_center"));
});

test("blocking profile requires an explicit pivot and configured gameplay boxes", () => {
  const project = paintedProject([[128, 128, "#ffffff"]]);
  activeAnimationOf(project).pivotExplicit = false;
  const report = qualityReport(project, {
    qaMode: "block",
    requirePivot: true,
    requiredBoxes: ["hurtbox", "attackbox"],
  });

  assert.equal(report.canExport, false);
  assert.ok(report.errors.some((issue) => issue.code === "pivot_missing"));
  assert.ok(report.errors.some((issue) => issue.code === "missing_hurtbox"));
  assert.ok(report.errors.some((issue) => issue.code === "missing_attackbox"));
});

test("PNG parity comparison detects dimensions and pixel divergence", () => {
  const project = paintedProject([[5, 6, "#123456"]]);
  const frame = activeFrameOf(project);
  const rgba = compositeFrameRgba(frame, project.background);

  assert.deepEqual(compareRenderedFrame(frame, project.background, rgba), {
    matches: true, dimensionsMatch: true, mismatchedPixels: 0,
  });
  const changed = new Uint8Array(rgba);
  changed[indexOf(5, 6, SIZE) * 4] = 0;
  assert.equal(compareRenderedFrame(frame, project.background, changed).mismatchedPixels, 1);
  assert.equal(compareRenderedFrame(frame, project.background, rgba, SIZE - 1, SIZE).dimensionsMatch, false);
});
