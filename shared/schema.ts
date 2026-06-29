import { z } from "zod";
import type { PixelArray, RlePixels } from "./model.ts";

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase());

export const PixelSchema = HexColorSchema.nullable();

export const PixelChangeSchema = z.object({
  index: z.number().int().nonnegative(),
  before: PixelSchema.optional(),
  after: PixelSchema,
});

// ─── Core geometric types ─────────────────────────────────────────────────────

export const DirectionSchema = z.enum([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const);

export const BoxKindSchema = z.enum(["hitbox", "hurtbox", "attackbox"]);

export const PointSchema = z.object({
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
});

export const HitboxSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: BoxKindSchema,
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  w: z.number().int().min(1).max(256),
  h: z.number().int().min(1).max(256),
});

// ─── Pixel data ───────────────────────────────────────────────────────────────

export const RleRunSchema = z.tuple([
  z.number().int().nonnegative(),
  z.string().nullable(),
]);

export const RlePixelsSchema = z.object({
  encoding: z.literal("rle"),
  size: z.number().int().positive(),
  runs: z.array(RleRunSchema),
});

/** Accepts expanded pixel arrays and RLE-encoded compact pixels.
 * Per-element hex validation is skipped for performance; trust expandPixels(). */
export const PixelsDataSchema = z.custom<PixelArray | RlePixels>(
  (val) => {
    if (Array.isArray(val)) return true;
    if (
      val !== null &&
      typeof val === "object" &&
      (val as Record<string, unknown>).encoding === "rle" &&
      typeof (val as Record<string, unknown>).size === "number" &&
      Array.isArray((val as Record<string, unknown>).runs)
    )
      return true;
    return false;
  },
  { message: "pixels must be a pixel array or RLE pixel data" },
);

// ─── Layer ────────────────────────────────────────────────────────────────────

export const LayerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean().default(false),
  alphaLocked: z.boolean().default(false),
  pixels: PixelsDataSchema,
});

// ─── Frame ────────────────────────────────────────────────────────────────────

export const FrameSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().int().min(1).max(5000),
  layers: z.array(LayerSchema).min(1),
  activeLayerId: z.string().min(1),
  pivot: PointSchema,
  hitboxes: z.array(HitboxSchema),
});

// ─── Animation ────────────────────────────────────────────────────────────────

export const AnimationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: DirectionSchema,
  fps: z.number().int().min(1).max(60),
  loop: z.boolean(),
  frames: z.array(FrameSchema).min(1).max(64),
});

// ─── Export profile ───────────────────────────────────────────────────────────

export const ExportProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  engine: z.enum(["godot", "unity", "generic"]),
  pixelsPerUnit: z.number().positive().optional(),
});

// ─── Asset ────────────────────────────────────────────────────────────────────

export const AssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  palette: z.array(HexColorSchema).min(1).max(256),
  animations: z.array(AnimationSchema).min(1).max(64),
  exportProfiles: z.array(ExportProfileSchema).min(1),
});

// ─── Godot metadata ───────────────────────────────────────────────────────────

export const GodotMetaSchema = z.object({
  asset: z.string().min(1),
  animation: z.string().min(1),
  direction: DirectionSchema,
  fps: z.number().int().min(1).max(60),
  loop: z.boolean(),
});

// ─── Project background ───────────────────────────────────────────────────────

export const ProjectBackgroundSchema = z.object({
  mode: z.enum(["transparent", "color"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// ─── Full normalized project ──────────────────────────────────────────────────

export const ProjectSchema = z.object({
  schemaVersion: z.literal(2),
  size: z.literal(256),
  revision: z.number().int().nonnegative(),
  assets: z.array(AssetSchema).min(1),
  activeAssetId: z.string().min(1),
  activeAnimationId: z.string().min(1),
  frames: z.array(FrameSchema).min(1),
  activeFrameId: z.string().min(1),
  palette: z.array(HexColorSchema).min(1).max(256),
  godot: GodotMetaSchema,
  background: ProjectBackgroundSchema,
  quality: z.record(z.string(), z.unknown()).optional(),
});

// ─── Loose project input (bridge / frontend / AI) ─────────────────────────────

/**
 * Validates that a project payload is a structurally sound object.
 * Rejects non-objects, wrong array types and invalid revision numbers.
 * Does NOT enforce pixel-level or deep sub-object rules;
 * always pass through expandProject() before using as a Project.
 */
export const ProjectInputSchema = z
  .object({
    format: z.string().optional(),
    version: z.number().optional(),
    project: z.record(z.string(), z.unknown()).optional(),
    schemaVersion: z.number().int().optional(),
    revision: z.number().int().nonnegative().optional(),
    assets: z.array(z.unknown()).optional(),
    frames: z.array(z.unknown()).optional(),
    palette: z.array(z.unknown()).optional(),
    godot: z.record(z.string(), z.unknown()).optional(),
    background: z.record(z.string(), z.unknown()).optional(),
    size: z.number().int().optional(),
    activeAssetId: z.string().optional(),
    activeAnimationId: z.string().optional(),
    activeFrameId: z.string().optional(),
  })
  .passthrough();

// ─── Diff operations ──────────────────────────────────────────────────────────

export const PixelsChangedOperationSchema = z.object({
  type: z.literal("pixels.changed"),
  frameId: z.string().min(1),
  layerId: z.string().min(1),
  changes: z.array(PixelChangeSchema).min(1),
});

export const LayerAddedOperationSchema = z.object({
  type: z.literal("layer.added"),
  frameId: z.string().min(1),
  index: z.number().int().nonnegative(),
  layer: LayerSchema,
  activeLayerIdBefore: z.string(),
  activeLayerIdAfter: z.string(),
});

export const LayerRemovedOperationSchema = z.object({
  type: z.literal("layer.removed"),
  frameId: z.string().min(1),
  index: z.number().int().nonnegative(),
  layer: LayerSchema,
  activeLayerIdBefore: z.string(),
  activeLayerIdAfter: z.string(),
});

export const FrameUpdatedOperationSchema = z.object({
  type: z.literal("frame.updated"),
  frameId: z.string().min(1),
  before: z.object({
    name: z.string(),
    duration: z.number().int().min(1).max(5000),
    pivot: PointSchema.optional(),
    hitboxes: z.array(HitboxSchema).optional(),
  }),
  after: z.object({
    name: z.string(),
    duration: z.number().int().min(1).max(5000),
    pivot: PointSchema.optional(),
    hitboxes: z.array(HitboxSchema).optional(),
  }),
});

export const ProjectReplacedOperationSchema = z.object({
  type: z.literal("project.replaced"),
  before: ProjectInputSchema,
  after: ProjectInputSchema,
});

export const ProjectSettingsChangedOperationSchema = z.object({
  type: z.literal("project.settings.changed"),
  after: z.object({
    activeAssetId: z.string().optional(),
    activeAnimationId: z.string().optional(),
    activeFrameId: z.string().optional(),
    palette: z.array(HexColorSchema).max(256).optional(),
    godot: GodotMetaSchema.optional(),
    background: ProjectBackgroundSchema.optional(),
    quality: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const FramesReplacedOperationSchema = z.object({
  type: z.literal("frames.replaced"),
  assetId: z.string().min(1),
  animationId: z.string().min(1),
  activeFrameId: z.string().optional(),
  frames: z.array(FrameSchema).min(1).max(64),
});

export const AssetAnimationsReplacedOperationSchema = z.object({
  type: z.literal("asset.animations.replaced"),
  assetId: z.string().min(1),
  activeAnimationId: z.string().optional(),
  activeFrameId: z.string().optional(),
  animations: z.array(AnimationSchema).min(1).max(64),
});

export const ProjectDiffOperationSchema = z.discriminatedUnion("type", [
  PixelsChangedOperationSchema,
  LayerAddedOperationSchema,
  LayerRemovedOperationSchema,
  FrameUpdatedOperationSchema,
  ProjectSettingsChangedOperationSchema,
  FramesReplacedOperationSchema,
  AssetAnimationsReplacedOperationSchema,
  ProjectReplacedOperationSchema,
]);

export const McpCommandSchema = z
  .object({
    source: z.string().default("mcp"),
    tool: z.string().min(1),
    prompt: z.string().optional(),
    timestamp: z.string().datetime().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const ProjectDiffSchema = z.object({
  format: z.literal("pixel-art-project-diff-v1"),
  version: z.literal(1),
  baseRevision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  command: McpCommandSchema.optional(),
  operations: z.array(ProjectDiffOperationSchema).min(1),
});

export type ProjectDiffOperation = z.infer<typeof ProjectDiffOperationSchema>;
export type ProjectDiff = z.infer<typeof ProjectDiffSchema>;
export type McpCommand = z.infer<typeof McpCommandSchema>;

// ─── Inferred types from strict schemas ──────────────────────────────────────

export type ValidatedProject = z.infer<typeof ProjectSchema>;
export type ValidatedAsset = z.infer<typeof AssetSchema>;
export type ValidatedAnimation = z.infer<typeof AnimationSchema>;
export type ValidatedFrame = z.infer<typeof FrameSchema>;
export type ValidatedLayer = z.infer<typeof LayerSchema>;
export type ValidatedHitbox = z.infer<typeof HitboxSchema>;
