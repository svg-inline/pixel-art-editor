import { z } from "zod";

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
  layer: z.any(),
  activeLayerIdBefore: z.string(),
  activeLayerIdAfter: z.string(),
});

export const LayerRemovedOperationSchema = z.object({
  type: z.literal("layer.removed"),
  frameId: z.string().min(1),
  index: z.number().int().nonnegative(),
  layer: z.any(),
  activeLayerIdBefore: z.string(),
  activeLayerIdAfter: z.string(),
});

export const FrameUpdatedOperationSchema = z.object({
  type: z.literal("frame.updated"),
  frameId: z.string().min(1),
  before: z.object({
    name: z.string(),
    duration: z.number().int().min(1).max(5000),
    pivot: z.any().optional(),
    hitboxes: z.array(z.any()).optional(),
  }),
  after: z.object({
    name: z.string(),
    duration: z.number().int().min(1).max(5000),
    pivot: z.any().optional(),
    hitboxes: z.array(z.any()).optional(),
  }),
});

export const ProjectReplacedOperationSchema = z.object({
  type: z.literal("project.replaced"),
  before: z.any(),
  after: z.any(),
});

export const ProjectSettingsChangedOperationSchema = z.object({
  type: z.literal("project.settings.changed"),
  after: z.object({
    activeAssetId: z.string().optional(),
    activeAnimationId: z.string().optional(),
    activeFrameId: z.string().optional(),
    palette: z.array(HexColorSchema).max(256).optional(),
    godot: z.any().optional(),
    background: z.any().optional(),
    quality: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const FramesReplacedOperationSchema = z.object({
  type: z.literal("frames.replaced"),
  assetId: z.string().min(1),
  animationId: z.string().min(1),
  activeFrameId: z.string().optional(),
  frames: z.array(z.any()).min(1).max(64),
});

export const AssetAnimationsReplacedOperationSchema = z.object({
  type: z.literal("asset.animations.replaced"),
  assetId: z.string().min(1),
  activeAnimationId: z.string().optional(),
  activeFrameId: z.string().optional(),
  animations: z.array(z.any()).min(1).max(64),
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
