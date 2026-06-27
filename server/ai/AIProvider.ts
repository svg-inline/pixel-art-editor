import { z } from "zod";
import {
  activeFrameOf,
  activeLayerOf,
  colorsUsed,
  compactProject,
  expandPixels,
  expandProject,
  indexOf,
  isHex,
  limitColors,
  qualityReport,
  selectionBounds,
  SIZE,
  type Pixel,
  type Project,
  type Selection,
} from "../../shared/pixel-core.ts";
import { ProjectInputSchema, ProjectSchema } from "../../shared/schema.ts";

export const AiOperationSchema = z.enum([
  "generate",
  "edit",
  "edit_selection",
  "replace_subject",
  "create_variation",
  "recolor_palette",
  "extend_animation",
]);
export type AiOperation = z.infer<typeof AiOperationSchema>;

export type AiConstraints = {
  size: number;
  maxColors?: number;
  palette?: string[];
  preserveOutsideSelection?: boolean;
};
export type AiProviderKind = "heuristic" | "external-ai";
export type AiRequest = {
  prompt: string;
  operation?: AiOperation;
  project?: unknown;
  selection?: Selection | null;
  layer?: string;
  from?: string;
  to?: string;
  maxColors?: number;
  palette?: string[];
  constraints?: Partial<AiConstraints>;
};
export type AiProviderResult = {
  project: Project;
  provider: string;
  providerKind: AiProviderKind;
  model?: string;
  warnings?: string[];
  fallback?: {
    provider: string;
    code: string;
  };
};
export type AIProvider = {
  name: string;
  kind: AiProviderKind;
  generate(input: AiRequest): Promise<AiProviderResult>;
};

export const MAX_AI_PROMPT_LENGTH = 2_000;
export const DEFAULT_AI_TIMEOUT_MS = 15_000;
export const DEFAULT_AI_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class AiProviderError extends Error {
  constructor(
    public code: string,
    public recoverable = true,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "AiProviderError";
  }
}

const AiSelectionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite(),
    h: z.number().finite(),
  })
  .nullable()
  .optional();

export const AiRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(MAX_AI_PROMPT_LENGTH),
    operation: AiOperationSchema.default("generate"),
    project: z.unknown().optional(),
    selection: AiSelectionSchema,
    layer: z.string().trim().min(1).max(128).optional(),
    from: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    to: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    maxColors: z.number().int().min(2).max(256).optional(),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(256).optional(),
    constraints: z
      .object({
        size: z.number().int().positive().optional(),
        maxColors: z.number().int().min(2).max(256).optional(),
        palette: z
          .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
          .max(256)
          .optional(),
        preserveOutsideSelection: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

const PixelSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();
const PixelChangeSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(0)
      .max(SIZE * SIZE - 1)
      .optional(),
    x: z
      .number()
      .int()
      .min(0)
      .max(SIZE - 1)
      .optional(),
    y: z
      .number()
      .int()
      .min(0)
      .max(SIZE - 1)
      .optional(),
    color: PixelSchema,
  })
  .passthrough();
const PixelDiffSchema = z
  .object({
    frameId: z.string().optional(),
    frameIndex: z.number().int().min(0).optional(),
    layerId: z.string().optional(),
    layerName: z.string().optional(),
    changes: z.array(PixelChangeSchema).optional(),
    pixels: z.array(PixelChangeSchema).optional(),
  })
  .passthrough();
export const AiProviderResponseSchema = z
  .object({
    provider: z.string().trim().min(1).max(128).optional(),
    model: z.string().trim().min(1).max(128).optional(),
    project: ProjectInputSchema.optional(),
    frames: z.array(z.record(z.string(), z.unknown())).optional(),
    diff: z.union([PixelDiffSchema, z.array(PixelDiffSchema)]).optional(),
    pngBase64: z.string().optional(),
    imageBase64: z.string().optional(),
    warnings: z.array(z.string().max(500)).max(50).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.project || value.frames || value.diff) return;
    ctx.addIssue({
      code: "custom",
      message: "AI response must include project, frames or diff",
    });
  });

export function validateAiRequest(input: AiRequest): AiRequest {
  const result = AiRequestSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
      .join("; ");
    throw new AiProviderError(`ai_request_invalid_${issues}`, false);
  }
  const parsed = result.data;
  const project = expandProject(parsed.project || {});
  const validation = ProjectSchema.safeParse(project);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
      .join("; ");
    throw new AiProviderError(`ai_request_invalid_project_${issues}`, false);
  }
  const normalizedSelection = selectionBounds(parsed.selection) || null;
  return {
    ...parsed,
    prompt: parsed.prompt.trim(),
    project,
    selection: normalizedSelection,
    palette: parsed.palette?.map((color) => color.toLowerCase()),
    constraints: parsed.constraints
      ? {
          ...parsed.constraints,
          size: SIZE,
          palette: parsed.constraints.palette?.map((color) =>
            color.toLowerCase(),
          ),
        }
      : undefined,
  };
}

export function buildAiPayload(input: AiRequest) {
  const validated = validateAiRequest(input);
  const project = expandProject(validated.project || {});
  const palette =
    validated.palette?.filter(isHex).map((color) => color.toLowerCase()) ||
    project.palette;
  return {
    prompt: validated.prompt,
    operation: validated.operation || "generate",
    project: compactProject(project),
    selection: selectionBounds(validated.selection) || null,
    layer: validated.layer,
    palette,
    constraints: {
      maxColors: validated.maxColors,
      palette,
      preserveOutsideSelection:
        validated.operation === "edit_selection" ||
        validated.operation === "replace_subject",
      ...validated.constraints,
      size: SIZE,
    },
  };
}

export function projectFromAiResponse(
  responseInput: unknown,
  input: AiRequest,
): Project {
  const response = AiProviderResponseSchema.parse(responseInput);
  const base = expandProject(input.project || {});
  if (response.project) return postProcessAiProject(response.project, input);
  if (response.frames) {
    return postProcessAiProject({ ...base, frames: response.frames }, input);
  }
  if (response.diff) {
    const diffs = Array.isArray(response.diff)
      ? response.diff
      : [response.diff];
    const project = expandProject(base);
    for (const diff of diffs) applyPixelDiff(project, diff);
    return postProcessAiProject(project, input);
  }
  return postProcessAiProject(base, input);
}

export function postProcessAiProject(projectInput: unknown, input: AiRequest) {
  const base = expandProject(input.project || {});
  let project = expandProject(projectInput);
  if (
    input.selection &&
    (input.operation === "edit_selection" ||
      input.operation === "replace_subject")
  ) {
    project = preserveOutsideSelection(base, project, input.selection);
  }
  const palette = (
    input.constraints?.palette ||
    input.palette ||
    base.palette ||
    []
  )
    .filter(isHex)
    .map((color) => color.toLowerCase());
  if (palette.length) quantizeToPalette(project, palette);
  else if (input.maxColors) project = limitColors(project, input.maxColors);
  if (input.maxColors) project = limitColors(project, input.maxColors);
  project.quality = qualityReport(project, input.maxColors || 32);
  const _normalized = expandProject(project);
  const _aiValidation = ProjectSchema.safeParse(_normalized);
  if (!_aiValidation.success) {
    const _issues = _aiValidation.error.issues
      .map((i) => `${i.path.join(".") || "project"}: ${i.message}`)
      .join("; ");
    throw new Error(`ai_output_invalid_project_${_issues}`);
  }
  return _normalized;
}

function applyPixelDiff(
  project: Project,
  diff: z.infer<typeof PixelDiffSchema>,
) {
  const frame =
    (diff.frameId && project.frames.find((item) => item.id === diff.frameId)) ||
    project.frames[diff.frameIndex || 0] ||
    activeFrameOf(project);
  const layer =
    (diff.layerId && frame.layers.find((item) => item.id === diff.layerId)) ||
    (diff.layerName &&
      frame.layers.find((item) => item.name === diff.layerName)) ||
    activeLayerOf(frame);
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  for (const change of diff.changes || diff.pixels || []) {
    const i =
      typeof change.index === "number"
        ? change.index
        : typeof change.x === "number" && typeof change.y === "number"
          ? indexOf(change.x, change.y)
          : -1;
    if (i >= 0 && i < pixels.length)
      pixels[i] = change.color ? change.color.toLowerCase() : null;
  }
}

function preserveOutsideSelection(
  baseInput: Project,
  projectInput: Project,
  selection: Selection,
) {
  const base = expandProject(baseInput);
  const project = expandProject(projectInput);
  const bounds = selectionBounds(selection);
  if (!bounds) return project;
  for (const frame of project.frames) {
    const baseFrame =
      base.frames.find((item) => item.id === frame.id) || activeFrameOf(base);
    for (const layer of frame.layers) {
      const baseLayer =
        baseFrame.layers.find((item) => item.id === layer.id) ||
        baseFrame.layers.find((item) => item.name === layer.name);
      if (!baseLayer) continue;
      const pixels = expandPixels(layer.pixels);
      const source = expandPixels(baseLayer.pixels);
      layer.pixels = pixels;
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const inside =
            x >= bounds.x &&
            y >= bounds.y &&
            x < bounds.x + bounds.w &&
            y < bounds.y + bounds.h;
          if (!inside) pixels[indexOf(x, y)] = source[indexOf(x, y)];
        }
    }
  }
  return project;
}

function quantizeToPalette(project: Project, palette: string[]) {
  const normalized = [
    ...new Set(palette.filter(isHex).map((c) => c.toLowerCase())),
  ];
  if (!normalized.length) return project;
  for (const frame of project.frames)
    for (const layer of frame.layers) {
      const pixels = expandPixels(layer.pixels);
      layer.pixels = pixels;
      for (let i = 0; i < pixels.length; i++) {
        const color = pixels[i];
        if (!color) continue;
        pixels[i] = nearestPaletteColor(color, normalized);
      }
    }
  const used = colorsUsed(project).map(([color]) => color);
  project.palette = used.length ? used : normalized;
  return project;
}

function nearestPaletteColor(color: string, palette: string[]): Pixel {
  const rgb = hexToRgb(color);
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const c = hexToRgb(candidate);
    const distance =
      (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
