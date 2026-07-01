import { activeAssetOf } from "./animation.ts";
import {
  expandProject,
  expandPixels,
  SIZE,
  type BoxKind,
  type ExportProfile,
  type Frame,
  type Project,
  type ProjectBackground,
  type Selection,
} from "./model.ts";
import { compositeFrameRgba } from "./render.ts";

export type QaSeverity = "error" | "warning" | "info";

export type QaIssue = {
  code: string;
  severity: QaSeverity;
  title: string;
  detail: string;
  frameId?: string;
  frameName?: string;
};

export type ObjectBounds = Selection & {
  pixels: number;
  cx: number;
  cy: number;
  coverage: number;
  centerOffsetX: number;
  centerOffsetY: number;
  margin: { top: number; right: number; bottom: number; left: number; min: number };
};

export type FrameQaReport = {
  id: string;
  name: string;
  animation: string;
  colors: number;
  transparentPixels: number;
  partialAlphaPixels: number;
  opaquePixels: number;
  falseCheckerboardPixels: number;
  bounds: ObjectBounds | null;
  pivot: { x: number; y: number; explicit: boolean };
  boxes: Record<BoxKind, number>;
};

export type QaOptions = Partial<
  Pick<
    ExportProfile,
    | "maxColors"
    | "binaryAlpha"
    | "minMargin"
    | "centerTolerance"
    | "requirePivot"
    | "requiredBoxes"
    | "qaMode"
  >
>;

const CHECKER_COLORS = new Set([
  "221,221,221", "204,204,204", "255,255,255", "245,245,245",
  "238,238,238", "153,153,153", "156,163,175",
]);

function rgbaKey(rgba: Uint8Array, index: number) {
  const offset = index * 4;
  return `${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`;
}

export function boundsFromRgba(rgba: Uint8Array): ObjectBounds | null {
  let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1, pixels = 0;
  for (let index = 0; index < SIZE * SIZE; index++) {
    if (!rgba[index * 4 + 3]) continue;
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    pixels++;
  }
  if (!pixels) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cx = minX + (w - 1) / 2;
  const cy = minY + (h - 1) / 2;
  const margin = {
    top: minY,
    right: SIZE - 1 - maxX,
    bottom: SIZE - 1 - maxY,
    left: minX,
    min: Math.min(minY, SIZE - 1 - maxX, SIZE - 1 - maxY, minX),
  };
  return {
    x: minX, y: minY, w, h, pixels, cx, cy,
    coverage: pixels / (SIZE * SIZE),
    centerOffsetX: Math.round(cx - (SIZE - 1) / 2),
    centerOffsetY: Math.round(cy - (SIZE - 1) / 2),
    margin,
  };
}

/** Detects painted neutral two-color checker tiles; UI transparency is never in project RGBA. */
export function countFalseCheckerboardRgba(rgba: Uint8Array) {
  const matches = new Set<number>();
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      const a = y * SIZE + x;
      const b = a + 1;
      const c = a + SIZE;
      const d = c + 1;
      if (![a, b, c, d].every((index) => rgba[index * 4 + 3] === 255)) continue;
      const ak = rgbaKey(rgba, a), bk = rgbaKey(rgba, b);
      if (ak !== bk && ak === rgbaKey(rgba, d) && bk === rgbaKey(rgba, c) &&
          CHECKER_COLORS.has(ak) && CHECKER_COLORS.has(bk)) {
        matches.add(a); matches.add(b); matches.add(c); matches.add(d);
      }
    }
  }
  return matches.size;
}

function frameMetrics(
  frame: Frame,
  animation: Project["assets"][number]["animations"][number],
  background: ProjectBackground,
): FrameQaReport {
  const rgba = compositeFrameRgba(frame, background);
  const colors = new Set<string>();
  let transparentPixels = 0, partialAlphaPixels = 0, opaquePixels = 0;
  for (let index = 0; index < SIZE * SIZE; index++) {
    const alpha = rgba[index * 4 + 3];
    if (alpha === 0) transparentPixels++;
    else {
      colors.add(rgbaKey(rgba, index));
      if (alpha === 255) opaquePixels++;
      else partialAlphaPixels++;
    }
  }
  const boxes = { hitbox: 0, hurtbox: 0, attackbox: 0 };
  for (const box of frame.hitboxes) boxes[box.kind]++;
  return {
    id: frame.id,
    name: frame.name,
    animation: animation.name,
    colors: colors.size,
    transparentPixels,
    partialAlphaPixels,
    opaquePixels,
    falseCheckerboardPixels: countFalseCheckerboardRgba(rgba),
    bounds: boundsFromRgba(rgba),
    pivot: { ...frame.pivot, explicit: animation.pivotExplicit || frame.pivotOverride },
    boxes,
  };
}

export function objectBounds(projectInput: unknown): ObjectBounds | null {
  const project = expandProject(projectInput);
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (const frame of project.frames) {
    const rendered = compositeFrameRgba(frame, project.background);
    for (let index = 0; index < SIZE * SIZE; index++)
      if (rendered[index * 4 + 3]) rgba[index * 4 + 3] = 255;
  }
  return boundsFromRgba(rgba);
}

function addFrameIssue(
  issues: QaIssue[],
  frame: FrameQaReport,
  code: string,
  severity: QaSeverity,
  title: string,
  detail: string,
) {
  issues.push({ code, severity, title, detail, frameId: frame.id, frameName: frame.name });
}

export function qualityReport(projectInput: Project, optionsInput: number | QaOptions = 32) {
  const project = expandProject(projectInput);
  const asset = activeAssetOf(project);
  const profile = asset.exportProfiles.find((item) => item.engine === "godot") || asset.exportProfiles[0];
  const input = typeof optionsInput === "number" ? { maxColors: optionsInput } : optionsInput;
  const options = {
    maxColors: input.maxColors ?? profile?.maxColors ?? 32,
    binaryAlpha: input.binaryAlpha ?? profile?.binaryAlpha ?? true,
    minMargin: input.minMargin ?? profile?.minMargin ?? 1,
    centerTolerance: input.centerTolerance ?? profile?.centerTolerance ?? 14,
    requirePivot: input.requirePivot ?? profile?.requirePivot ?? true,
    requiredBoxes: input.requiredBoxes ?? profile?.requiredBoxes ?? [],
    qaMode: input.qaMode ?? profile?.qaMode ?? "warning",
  };
  const frameReports = asset.animations.flatMap((animation) =>
    animation.frames.map((frame) => frameMetrics(frame, animation, project.background)),
  );
  const assetColors = new Set<string>();
  const assetColorCounts = new Map<string, number>();
  for (const animation of asset.animations)
    for (const frame of animation.frames) {
      const rgba = compositeFrameRgba(frame, project.background);
      for (let index = 0; index < SIZE * SIZE; index++)
        if (rgba[index * 4 + 3]) {
          const color = rgbaKey(rgba, index);
          assetColors.add(color);
          assetColorCounts.set(color, (assetColorCounts.get(color) || 0) + 1);
        }
    }
  const issues: QaIssue[] = [];
  for (const frame of frameReports) {
    if (!frame.bounds)
      addFrameIssue(issues, frame, "empty_canvas", "error", "Frame vazio", "Nenhum pixel visível será exportado.");
    if (frame.colors > options.maxColors)
      addFrameIssue(issues, frame, "palette_over_limit", "warning", "Paleta acima do limite", `${frame.colors} cores visíveis; limite do perfil: ${options.maxColors}.`);
    if (frame.falseCheckerboardPixels)
      addFrameIssue(issues, frame, "false_checkerboard_pixels", "warning", "Quadriculado pintado", `${frame.falseCheckerboardPixels} pixels parecem simular transparência.`);
    if (options.binaryAlpha && frame.partialAlphaPixels)
      addFrameIssue(issues, frame, "partial_alpha", "error", "Alpha parcial incompatível", `${frame.partialAlphaPixels} pixels têm alpha entre 1 e 254; o perfil exige alpha binário.`);
    if (frame.bounds && frame.bounds.margin.min < options.minMargin)
      addFrameIssue(issues, frame, "insufficient_margin", "warning", "Margem insuficiente", `Menor margem: ${frame.bounds.margin.min}px; perfil exige ${options.minMargin}px.`);
    if (frame.bounds && (Math.abs(frame.bounds.centerOffsetX) > options.centerTolerance || Math.abs(frame.bounds.centerOffsetY) > options.centerTolerance))
      addFrameIssue(issues, frame, "object_off_center", "warning", "Objeto descentralizado", `Deslocamento ${frame.bounds.centerOffsetX}, ${frame.bounds.centerOffsetY}px; tolerância: ${options.centerTolerance}px.`);
    if (options.requirePivot && !frame.pivot.explicit)
      addFrameIssue(issues, frame, "pivot_missing", "error", "Pivot não configurado", "O frame usa o centro legado; confirme um origin no perfil de animação.");
    for (const kind of options.requiredBoxes)
      if (!frame.boxes[kind])
        addFrameIssue(issues, frame, `missing_${kind}`, "error", `${kind} ausente`, `O perfil exige ao menos uma ${kind} neste frame.`);
  }
  if (assetColors.size > options.maxColors && !frameReports.some((frame) => frame.colors > options.maxColors))
    issues.push({
      code: "asset_palette_over_limit",
      severity: "warning",
      title: "Paleta do asset acima do limite",
      detail: `${assetColors.size} cores visíveis no asset; limite do perfil: ${options.maxColors}.`,
    });
  const colors = assetColors.size;
  const falseCheckerboardPixels = frameReports.reduce((sum, frame) => sum + frame.falseCheckerboardPixels, 0);
  const partialAlphaPixels = frameReports.reduce((sum, frame) => sum + frame.partialAlphaPixels, 0);
  const transparentPixels = frameReports.reduce((sum, frame) => sum + frame.transparentPixels, 0);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warningsDetailed = issues.filter((issue) => issue.severity === "warning");
  const bounds = objectBounds(project);
  const hasFullOpaqueLayer = project.frames.some((frame) =>
    frame.layers.some((layer) => layer.visible && expandPixels(layer.pixels).every(Boolean)),
  );
  const dominant = [...assetColorCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const visiblePixels = [...assetColorCounts.values()].reduce((sum, count) => sum + count, 0);
  return {
    profile: options,
    colors,
    assetColors: colors,
    maxColors: options.maxColors,
    overLimit: colors > options.maxColors,
    falseCheckerboardPixels,
    partialAlphaPixels,
    transparentPixels,
    hasRealTransparency: transparentPixels > 0,
    hasFullOpaqueLayer,
    transparentOk: options.binaryAlpha ? partialAlphaPixels === 0 : true,
    frames: project.frames.length,
    assetFrames: frameReports.length,
    layers: project.frames.reduce((sum, frame) => sum + frame.layers.length, 0),
    background: project.background,
    bounds,
    dominantColor: dominant
      ? {
          color: `#${dominant[0].split(",").map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`,
          pixels: dominant[1],
          share: visiblePixels ? Number((dominant[1] / visiblePixels).toFixed(3)) : 0,
        }
      : null,
    frameReports,
    issues,
    errors,
    warningsDetailed,
    warnings: [...new Set(issues.filter((issue) => issue.severity !== "info").map((issue) => issue.code))],
    canExport: options.qaMode !== "block" || errors.length === 0,
  };
}

export function compareRenderedFrame(
  frame: Frame,
  background: ProjectBackground,
  exportedRgba: Uint8Array | Uint8ClampedArray,
  width = SIZE,
  height = SIZE,
) {
  if (width !== SIZE || height !== SIZE)
    return { matches: false, dimensionsMatch: false, mismatchedPixels: SIZE * SIZE };
  const expected = compositeFrameRgba(frame, background);
  let mismatchedPixels = 0;
  for (let index = 0; index < SIZE * SIZE; index++) {
    const offset = index * 4;
    if (expected[offset] !== exportedRgba[offset] || expected[offset + 1] !== exportedRgba[offset + 1] ||
        expected[offset + 2] !== exportedRgba[offset + 2] || expected[offset + 3] !== exportedRgba[offset + 3])
      mismatchedPixels++;
  }
  return { matches: mismatchedPixels === 0, dimensionsMatch: true, mismatchedPixels };
}
