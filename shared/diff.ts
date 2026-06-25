import {
  activeFrameOf,
  activeLayerOf,
  clone,
  colorsUsed,
  expandPixels,
  expandProject,
  PIXEL_COUNT,
  SIZE,
  syncActiveAnimationMeta,
  type Project,
  type PixelArray,
} from "./pixel-core.ts";
import {
  applyPatch,
  createProjectCommand,
  type HistoryPatch,
} from "./history.ts";
import {
  ProjectDiffSchema,
  type McpCommand,
  type ProjectDiff,
  type ProjectDiffOperation,
} from "./schema.ts";

export const MAX_DIFF_BYTES = 2 * 1024 * 1024;
export const MAX_DIFF_OPERATIONS = 256;
export const MAX_DIFF_PIXEL_CHANGES = PIXEL_COUNT * 8;
export const MAX_PROJECT_COLORS = 256;

export type ProjectDiffSummary = {
  operations: number;
  pixelChanges: number;
  structuralChanges: number;
  replacesProject: boolean;
  colorsAfter: number;
};

function byteSize(input: unknown) {
  return new TextEncoder().encode(JSON.stringify(input)).length;
}

function frameById(project: Project, frameId: string) {
  return project.frames.find((frame) => frame.id === frameId);
}

function layerById(project: Project, frameId: string, layerId: string) {
  return frameById(project, frameId)?.layers.find((layer) => layer.id === layerId);
}

function summarize(projectAfter: Project, operations: ProjectDiffOperation[]) {
  const pixelChanges = operations.reduce(
    (sum, operation) =>
      operation.type === "pixels.changed"
        ? sum + operation.changes.length
        : sum,
    0,
  );
  return {
    operations: operations.length,
    pixelChanges,
    structuralChanges: operations.filter((op) => op.type !== "pixels.changed")
      .length,
    replacesProject: operations.some((op) => op.type === "project.replaced"),
    colorsAfter: colorsUsed(projectAfter).length,
  } satisfies ProjectDiffSummary;
}

function activeAsset(project: Project) {
  return (
    project.assets.find((asset) => asset.id === project.activeAssetId) ||
    project.assets[0]
  );
}

function activeAnimation(project: Project) {
  const asset = activeAsset(project);
  return (
    asset.animations.find(
      (animation) => animation.id === project.activeAnimationId,
    ) || asset.animations[0]
  );
}

function settingsSnapshot(project: Project) {
  return {
    activeAssetId: project.activeAssetId,
    activeAnimationId: project.activeAnimationId,
    activeFrameId: project.activeFrameId,
    palette: project.palette,
    godot: project.godot,
    background: project.background,
    quality: project.quality,
  };
}

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createStructuredOperations(before: Project, after: Project) {
  const operations: ProjectDiffOperation[] = [];
  const beforeSettings = settingsSnapshot(before);
  const afterSettings = settingsSnapshot(after);
  if (!jsonEqual(beforeSettings, afterSettings)) {
    operations.push({
      type: "project.settings.changed",
      after: afterSettings,
    });
  }

  const beforeAsset = activeAsset(before);
  const afterAsset = after.assets.find((asset) => asset.id === beforeAsset.id);
  if (!afterAsset) return operations;

  const beforeAnimation = activeAnimation(before);
  const afterAnimation = afterAsset.animations.find(
    (animation) => animation.id === beforeAnimation.id,
  );
  if (
    beforeAsset.animations.length !== afterAsset.animations.length ||
    !afterAnimation
  ) {
    operations.push({
      type: "asset.animations.replaced",
      assetId: afterAsset.id,
      activeAnimationId: after.activeAnimationId,
      activeFrameId: after.activeFrameId,
      animations: clone(afterAsset.animations),
    });
    return operations;
  }

  if (!jsonEqual(beforeAnimation.frames, afterAnimation.frames)) {
    operations.push({
      type: "frames.replaced",
      assetId: afterAsset.id,
      animationId: afterAnimation.id,
      activeFrameId: after.activeFrameId,
      frames: clone(afterAnimation.frames),
    });
  }
  return operations;
}

export function createProjectDiff(
  beforeInput: unknown,
  afterInput: unknown,
  command?: Partial<McpCommand>,
): ProjectDiff | null {
  const before = expandProject(beforeInput);
  const after = expandProject(afterInput);
  const historyCommand = createProjectCommand(
    before,
    after,
    "project.change",
    command?.params,
    command?.source || "mcp",
  );
  if (!historyCommand) return null;
  let operations = historyCommand.patches as ProjectDiffOperation[];
  if (operations.some((operation) => operation.type === "project.replaced")) {
    const structuredOperations = createStructuredOperations(before, after);
    if (structuredOperations.length) operations = structuredOperations;
  }
  return {
    format: "pixel-art-project-diff-v1",
    version: 1,
    baseRevision: before.revision,
    createdAt: new Date().toISOString(),
    command: command?.tool
      ? {
          source: command.source || "mcp",
          tool: command.tool,
          prompt: command.prompt,
          timestamp: command.timestamp || new Date().toISOString(),
          params: command.params,
        }
      : undefined,
    operations,
  };
}

export function diffSummary(projectInput: unknown, diffInput: unknown) {
  const preview = applyProjectDiff(projectInput, diffInput);
  const diff = ProjectDiffSchema.parse(diffInput);
  return summarize(preview, diff.operations);
}

export function validateProjectDiff(
  projectInput: unknown,
  diffInput: unknown,
): ProjectDiff {
  const payloadBytes = byteSize(diffInput);
  if (payloadBytes > MAX_DIFF_BYTES)
    throw new Error(`diff_payload_too_large_${MAX_DIFF_BYTES}`);

  const result = ProjectDiffSchema.safeParse(diffInput);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "diff"}: ${issue.message}`)
      .join("; ");
    throw new Error(`invalid_project_diff_${issues}`);
  }

  const project = expandProject(projectInput);
  const diff = result.data;
  if (diff.operations.length > MAX_DIFF_OPERATIONS)
    throw new Error(`diff_too_many_operations_${MAX_DIFF_OPERATIONS}`);

  let totalPixelChanges = 0;
  const colors = new Set<string>();
  for (const operation of diff.operations) {
    if (operation.type === "pixels.changed") {
      const layer = layerById(project, operation.frameId, operation.layerId);
      if (!layer)
        throw new Error(
          `diff_target_not_found_${operation.frameId}_${operation.layerId}`,
        );
      const pixels = expandPixels(layer.pixels);
      totalPixelChanges += operation.changes.length;
      for (const change of operation.changes) {
        if (change.index < 0 || change.index >= PIXEL_COUNT)
          throw new Error(`diff_pixel_index_out_of_bounds_${change.index}`);
        if (change.before !== undefined && pixels[change.index] !== change.before)
          throw new Error(`diff_stale_pixel_${change.index}`);
        if (change.after) colors.add(change.after);
      }
      continue;
    }
    if (operation.type === "layer.added") {
      const frame = frameById(project, operation.frameId);
      if (!frame) throw new Error(`diff_frame_not_found_${operation.frameId}`);
      if (operation.index > frame.layers.length)
        throw new Error(`diff_layer_index_out_of_bounds_${operation.index}`);
      const pixels = expandPixels(operation.layer?.pixels);
      if (pixels.length !== PIXEL_COUNT) throw new Error("diff_invalid_layer_pixels");
      for (const px of pixels) if (px) colors.add(px);
      continue;
    }
    if (operation.type === "layer.removed") {
      const frame = frameById(project, operation.frameId);
      if (!frame) throw new Error(`diff_frame_not_found_${operation.frameId}`);
      if (frame.layers.length <= 1) throw new Error("diff_cannot_remove_last_layer");
      if (!frame.layers.some((layer) => layer.id === operation.layer?.id))
        throw new Error(`diff_layer_not_found_${operation.layer?.id || ""}`);
      continue;
    }
    if (operation.type === "frame.updated") {
      const frame = frameById(project, operation.frameId);
      if (!frame) throw new Error(`diff_frame_not_found_${operation.frameId}`);
      if (
        frame.name !== operation.before.name ||
        frame.duration !== operation.before.duration
      )
        throw new Error(`diff_stale_frame_${operation.frameId}`);
      continue;
    }
    if (operation.type === "project.settings.changed") {
      if (operation.after.palette && operation.after.palette.length > MAX_PROJECT_COLORS)
        throw new Error(`diff_too_many_colors_${MAX_PROJECT_COLORS}`);
      for (const color of operation.after.palette || []) colors.add(color);
      continue;
    }
    if (operation.type === "frames.replaced") {
      const asset = project.assets.find((item) => item.id === operation.assetId);
      if (!asset) throw new Error(`diff_asset_not_found_${operation.assetId}`);
      if (!asset.animations.some((item) => item.id === operation.animationId))
        throw new Error(`diff_animation_not_found_${operation.animationId}`);
      for (const frame of operation.frames) {
        for (const layer of frame?.layers || [])
          for (const px of expandPixels(layer?.pixels)) if (px) colors.add(px);
      }
      continue;
    }
    if (operation.type === "asset.animations.replaced") {
      if (!project.assets.some((item) => item.id === operation.assetId))
        throw new Error(`diff_asset_not_found_${operation.assetId}`);
      for (const animation of operation.animations)
        for (const frame of animation?.frames || [])
          for (const layer of frame?.layers || [])
            for (const px of expandPixels(layer?.pixels)) if (px) colors.add(px);
      continue;
    }
    if (operation.type === "project.replaced") {
      const after = expandProject(operation.after);
      if (after.size !== SIZE) throw new Error("diff_invalid_project_size");
      for (const [color] of colorsUsed(after)) colors.add(color);
      if (colors.size > MAX_PROJECT_COLORS)
        throw new Error(`diff_too_many_colors_${MAX_PROJECT_COLORS}`);
    }
  }

  if (totalPixelChanges > MAX_DIFF_PIXEL_CHANGES)
    throw new Error(`diff_too_many_pixel_changes_${MAX_DIFF_PIXEL_CHANGES}`);
  if (colors.size > MAX_PROJECT_COLORS)
    throw new Error(`diff_too_many_colors_${MAX_PROJECT_COLORS}`);
  return diff;
}

export function applyProjectDiff(
  projectInput: unknown,
  diffInput: unknown,
): Project {
  const project = expandProject(projectInput);
  const diff = validateProjectDiff(project, diffInput);
  const next = diff.operations.reduce((current, operation) => {
    const mutable = expandProject(current);
    if (operation.type === "project.settings.changed") {
      const after = operation.after;
      if (after.activeAssetId) mutable.activeAssetId = after.activeAssetId;
      if (after.activeAnimationId)
        mutable.activeAnimationId = after.activeAnimationId;
      if (after.activeFrameId) mutable.activeFrameId = after.activeFrameId;
      if (after.palette) mutable.palette = [...after.palette];
      if (after.godot) mutable.godot = clone(after.godot);
      if (after.background) mutable.background = clone(after.background);
      if (after.quality) mutable.quality = clone(after.quality);
      syncActiveAnimationMeta(mutable);
      return expandProject(mutable);
    }
    if (operation.type === "frames.replaced") {
      const asset = mutable.assets.find((item) => item.id === operation.assetId);
      const animation = asset?.animations.find(
        (item) => item.id === operation.animationId,
      );
      if (!asset || !animation) return mutable;
      animation.frames = clone(operation.frames);
      mutable.activeAssetId = asset.id;
      mutable.activeAnimationId = animation.id;
      mutable.frames = animation.frames;
      mutable.activeFrameId =
        operation.activeFrameId || animation.frames[0]?.id || "";
      return expandProject(mutable);
    }
    if (operation.type === "asset.animations.replaced") {
      const asset = mutable.assets.find((item) => item.id === operation.assetId);
      if (!asset) return mutable;
      asset.animations = clone(operation.animations);
      mutable.activeAssetId = asset.id;
      mutable.activeAnimationId =
        operation.activeAnimationId || asset.animations[0]?.id || "";
      const animation = activeAnimation(mutable);
      mutable.frames = animation.frames;
      mutable.activeFrameId =
        operation.activeFrameId || animation.frames[0]?.id || "";
      return expandProject(mutable);
    }
    return applyPatch(mutable, operation as HistoryPatch);
  }, clone(project));
  const expanded = expandProject(next);
  if (colorsUsed(expanded).length > MAX_PROJECT_COLORS)
    throw new Error(`diff_too_many_colors_${MAX_PROJECT_COLORS}`);
  return expanded;
}

export function previewProjectDiff(projectInput: unknown, diffInput: unknown) {
  const project = expandProject(projectInput);
  const diff = validateProjectDiff(project, diffInput);
  const projectAfter = applyProjectDiff(project, diff);
  return {
    diff,
    project: projectAfter,
    summary: summarize(projectAfter, diff.operations),
  };
}

export function activeLayerPixelDiff(
  projectInput: unknown,
  pixelsAfter: PixelArray,
  command?: Partial<McpCommand>,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = activeFrameOf(after);
  const layer = activeLayerOf(frame);
  layer.pixels = pixelsAfter;
  return createProjectDiff(before, after, command);
}
