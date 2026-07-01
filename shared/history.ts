import {
  activeFrameOf,
  activeLayerOf,
  clone,
  compactPixels,
  compactProject,
  drawEllipse,
  drawLine,
  drawRect,
  expandPixels,
  expandProject,
  indexOf,
  normHex,
  setPixel,
  SIZE,
  type Layer,
  type Frame,
  type Pixel,
  type Project,
} from "./pixel-core.ts";

export const HISTORY_LIMIT = 100;

export type PixelChange = {
  index: number;
  before: Pixel;
  after: Pixel;
};

export type PixelPatch = {
  type: "pixels.changed";
  frameId: string;
  layerId: string;
  changes: PixelChange[];
};

export type LayerPatch =
  | {
      type: "layer.added";
      frameId: string;
      index: number;
      layer: Layer;
      activeLayerIdBefore: string;
      activeLayerIdAfter: string;
    }
  | {
      type: "layer.removed";
      frameId: string;
      index: number;
      layer: Layer;
      activeLayerIdBefore: string;
      activeLayerIdAfter: string;
    };

export type LayerUpdatedPatch = {
  type: "layer.updated";
  frameId: string;
  layerId: string;
  before: Omit<Layer, "pixels">;
  after: Omit<Layer, "pixels">;
};

export type LayerOrderPatch = {
  type: "layer.order.changed";
  frameId: string;
  before: string[];
  after: string[];
};

export type FrameCollectionPatch =
  | {
      type: "frame.added";
      assetId: string;
      animationId: string;
      index: number;
      frame: Frame;
      activeFrameIdBefore: string;
      activeFrameIdAfter: string;
    }
  | {
      type: "frame.removed";
      assetId: string;
      animationId: string;
      index: number;
      frame: Frame;
      activeFrameIdBefore: string;
      activeFrameIdAfter: string;
    }
  | {
      type: "frame.order.changed";
      assetId: string;
      animationId: string;
      before: string[];
      after: string[];
    };

type ProjectMetadata = Pick<
  Project,
  "activeAssetId" | "activeAnimationId" | "activeFrameId" | "palette" | "background" | "quality"
> & {
  assets: Array<{
    id: string;
    name: string;
    palette: string[];
    exportProfiles: Project["assets"][number]["exportProfiles"];
    animations: Array<Omit<Project["assets"][number]["animations"][number], "frames">>;
  }>;
};

export type ProjectMetadataPatch = {
  type: "project.metadata.changed";
  before: ProjectMetadata;
  after: ProjectMetadata;
};

export type FramePatch = {
  type: "frame.updated";
  frameId: string;
  before: Omit<Frame, "layers">;
  after: Omit<Frame, "layers">;
};

export type ProjectReplacePatch = {
  type: "project.replaced";
  before: ReturnType<typeof compactProject>;
  after: ReturnType<typeof compactProject>;
};

export type HistoryPatch =
  | PixelPatch
  | LayerPatch
  | LayerUpdatedPatch
  | LayerOrderPatch
  | FramePatch
  | FrameCollectionPatch
  | ProjectMetadataPatch
  | ProjectReplacePatch;

export type HistoryCommandName =
  | "setPixel"
  | "drawLine"
  | "drawRect"
  | "drawEllipse"
  | "floodFill"
  | "layer.add"
  | "layer.remove"
  | "frame.add"
  | "frame.remove"
  | "frame.duplicate"
  | "frame.move"
  | "project.replace"
  | "project.change"
  | "mcp.diff"
  | "draw_pixel"
  | "erase_pixel"
  | "fill_area"
  | "transform_selection"
  | "move_selection"
  | "rotate_selection"
  | "create_layer"
  | "delete_layer"
  | "layer_change"
  | "create_frame"
  | "delete_frame"
  | "frame_change"
  | "ai_preview_accept"
  | "import_asset"
  | "export_asset";

export type HistoryCommand = {
  id: string;
  at: string;
  command: {
    type: HistoryCommandName;
    label?: string;
    params?: Record<string, unknown>;
    source?: "web" | "bridge" | "mcp" | "migration" | string;
  };
  revisionBefore?: number;
  revisionAfter?: number;
  patches: HistoryPatch[];
};

function commandId() {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function command(
  before: Project,
  after: Project,
  type: HistoryCommandName,
  patches: HistoryPatch[],
  params?: Record<string, unknown>,
  source?: string,
): HistoryCommand {
  return {
    id: commandId(),
    at: new Date().toISOString(),
    command: { type, label: historyLabel(type), params, source },
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    patches,
  };
}

const HISTORY_LABELS: Partial<Record<HistoryCommandName, string>> = {
  setPixel: "Desenhar pixel",
  drawLine: "Desenhar linha",
  drawRect: "Desenhar retângulo",
  drawEllipse: "Desenhar elipse",
  floodFill: "Preencher área",
  "layer.add": "Criar camada",
  "layer.remove": "Excluir camada",
  "frame.add": "Criar frame",
  "frame.remove": "Excluir frame",
  "frame.duplicate": "Duplicar frame",
  "frame.move": "Mover frame",
  "project.replace": "Substituir projeto",
  "mcp.diff": "Aceitar alteração MCP",
  draw_pixel: "Desenhar pixels",
  erase_pixel: "Apagar pixels",
  fill_area: "Preencher área",
  transform_selection: "Transformar seleção",
  move_selection: "Mover seleção",
  rotate_selection: "Girar seleção",
  create_layer: "Criar camada",
  delete_layer: "Excluir camada",
  layer_change: "Alterar camada",
  create_frame: "Criar frame",
  delete_frame: "Excluir frame",
  frame_change: "Alterar frame",
  ai_preview_accept: "Aceitar alteração de IA",
  import_asset: "Importar asset",
  export_asset: "Exportar asset",
};

export function historyLabel(type: HistoryCommandName) {
  return HISTORY_LABELS[type] || type
    .replace(".", " ")
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function summarizeHistoryPrompt(input: unknown, limit = 120) {
  if (typeof input !== "string") return undefined;
  const value = input.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function getFrame(project: Project, frameId: string) {
  for (const asset of project.assets)
    for (const animation of asset.animations) {
      const frame = animation.frames.find((item) => item.id === frameId);
      if (frame) return frame;
    }
  return undefined;
}

function getLayer(project: Project, frameId: string, layerId: string) {
  return getFrame(project, frameId)?.layers.find((layer) => layer.id === layerId);
}

function withLayerPixels(
  project: Project,
  frameId: string,
  layerId: string,
) {
  const layer = getLayer(project, frameId, layerId);
  if (!layer) return null;
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  return pixels;
}

export function pixelPatchFromLayers(
  frameId: string,
  layerId: string,
  beforeLayer: Layer,
  afterLayer: Layer,
): PixelPatch | null {
  const before = expandPixels(beforeLayer.pixels);
  const after = expandPixels(afterLayer.pixels);
  const changes: PixelChange[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const b = before[i] ?? null;
    const a = after[i] ?? null;
    if (b !== a) changes.push({ index: i, before: b, after: a });
  }
  return changes.length ? { type: "pixels.changed", frameId, layerId, changes } : null;
}

function jsonEqual(before: unknown, after: unknown) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function compactLayer(layer: Layer): Layer {
  return { ...clone(layer), pixels: compactPixels(layer.pixels) };
}

function compactFrame(frame: Frame): Frame {
  return { ...clone(frame), layers: frame.layers.map(compactLayer) };
}

function layerMetadata(layer: Layer): Omit<Layer, "pixels"> {
  const { pixels: _pixels, ...metadata } = clone(layer);
  return metadata;
}

function frameMetadata(frame: Frame): Omit<Frame, "layers"> {
  const { layers: _layers, ...metadata } = clone(frame);
  return metadata;
}

function projectMetadata(project: Project): ProjectMetadata {
  return {
    activeAssetId: project.activeAssetId,
    activeAnimationId: project.activeAnimationId,
    activeFrameId: project.activeFrameId,
    palette: clone(project.palette),
    background: clone(project.background),
    quality: clone(project.quality || {}),
    assets: project.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      palette: clone(asset.palette),
      exportProfiles: clone(asset.exportProfiles),
      animations: asset.animations.map((animation) => {
        const { frames: _frames, ...metadata } = clone(animation);
        return metadata;
      }),
    })),
  };
}

function hasCompatibleAssetTopology(before: Project, after: Project) {
  if (!jsonEqual(before.assets.map((asset) => asset.id), after.assets.map((asset) => asset.id)))
    return false;
  return before.assets.every((asset) => {
    const nextAsset = after.assets.find((item) => item.id === asset.id);
    return Boolean(
      nextAsset &&
        jsonEqual(
          asset.animations.map((animation) => animation.id),
          nextAsset.animations.map((animation) => animation.id),
        ),
    );
  });
}

function framePatchFromFrames(
  beforeFrame: Project["frames"][number],
  afterFrame: Project["frames"][number],
): FramePatch | null {
  if (
    jsonEqual(frameMetadata(beforeFrame), frameMetadata(afterFrame))
  )
    return null;
  return {
    type: "frame.updated",
    frameId: beforeFrame.id,
    before: frameMetadata(beforeFrame),
    after: frameMetadata(afterFrame),
  };
}

function collectFramePatches(
  before: Project,
  after: Project,
  assetId: string,
  animationId: string,
  beforeFrames: Frame[],
  afterFrames: Frame[],
) {
  const patches: HistoryPatch[] = [];
  const beforeIds = beforeFrames.map((frame) => frame.id);
  const afterIds = afterFrames.map((frame) => frame.id);
  const beforeSet = new Set(beforeIds);
  const afterSet = new Set(afterIds);

  beforeFrames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => !afterSet.has(frame.id))
    .reverse()
    .forEach(({ frame, index }) =>
      patches.push({
        type: "frame.removed",
        assetId,
        animationId,
        index,
        frame: compactFrame(frame),
        activeFrameIdBefore: before.activeFrameId,
        activeFrameIdAfter: after.activeFrameId,
      }),
    );
  afterFrames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => !beforeSet.has(frame.id))
    .forEach(({ frame, index }) =>
      patches.push({
        type: "frame.added",
        assetId,
        animationId,
        index,
        frame: compactFrame(frame),
        activeFrameIdBefore: before.activeFrameId,
        activeFrameIdAfter: after.activeFrameId,
      }),
    );

  for (const beforeFrame of beforeFrames) {
    const afterFrame = afterFrames.find((frame) => frame.id === beforeFrame.id);
    if (!afterFrame) continue;
    const framePatch = framePatchFromFrames(beforeFrame, afterFrame);
    if (framePatch) patches.push(framePatch);

    const beforeLayerIds = beforeFrame.layers.map((layer) => layer.id);
    const afterLayerIds = afterFrame.layers.map((layer) => layer.id);
    const beforeLayerSet = new Set(beforeLayerIds);
    const afterLayerSet = new Set(afterLayerIds);
    beforeFrame.layers
      .map((layer, index) => ({ layer, index }))
      .filter(({ layer }) => !afterLayerSet.has(layer.id))
      .reverse()
      .forEach(({ layer, index }) =>
        patches.push({
          type: "layer.removed",
          frameId: beforeFrame.id,
          index,
          layer: compactLayer(layer),
          activeLayerIdBefore: beforeFrame.activeLayerId,
          activeLayerIdAfter: afterFrame.activeLayerId,
        }),
      );
    afterFrame.layers
      .map((layer, index) => ({ layer, index }))
      .filter(({ layer }) => !beforeLayerSet.has(layer.id))
      .forEach(({ layer, index }) =>
        patches.push({
          type: "layer.added",
          frameId: beforeFrame.id,
          index,
          layer: compactLayer(layer),
          activeLayerIdBefore: beforeFrame.activeLayerId,
          activeLayerIdAfter: afterFrame.activeLayerId,
        }),
      );

    for (const beforeLayer of beforeFrame.layers) {
      const afterLayer = afterFrame.layers.find((layer) => layer.id === beforeLayer.id);
      if (!afterLayer) continue;
      const beforeMetadata = layerMetadata(beforeLayer);
      const afterMetadata = layerMetadata(afterLayer);
      if (!jsonEqual(beforeMetadata, afterMetadata))
        patches.push({
          type: "layer.updated",
          frameId: beforeFrame.id,
          layerId: beforeLayer.id,
          before: beforeMetadata,
          after: afterMetadata,
        });
      const pixelPatch = pixelPatchFromLayers(
        beforeFrame.id,
        beforeLayer.id,
        beforeLayer,
        afterLayer,
      );
      if (pixelPatch) patches.push(pixelPatch);
    }

    if (!jsonEqual(beforeLayerIds, afterLayerIds))
      patches.push({
        type: "layer.order.changed",
        frameId: beforeFrame.id,
        before: beforeLayerIds,
        after: afterLayerIds,
      });
  }

  if (!jsonEqual(beforeIds, afterIds))
    patches.push({
      type: "frame.order.changed",
      assetId,
      animationId,
      before: beforeIds,
      after: afterIds,
    });
  return patches;
}

export function createProjectCommand(
  beforeInput: unknown,
  afterInput: unknown,
  type: HistoryCommandName = "project.change",
  params?: Record<string, unknown>,
  source?: string,
): HistoryCommand | null {
  const before = expandProject(beforeInput);
  const after = expandProject(afterInput);
  const patches: HistoryPatch[] = [];
  if (!hasCompatibleAssetTopology(before, after)) {
    patches.push({
      type: "project.replaced",
      before: compactProject(before),
      after: compactProject(after),
    });
  } else {
    for (const beforeAsset of before.assets) {
      const afterAsset = after.assets.find((asset) => asset.id === beforeAsset.id)!;
      for (const beforeAnimation of beforeAsset.animations) {
        const afterAnimation = afterAsset.animations.find(
          (animation) => animation.id === beforeAnimation.id,
        )!;
        patches.push(
          ...collectFramePatches(
            before,
            after,
            beforeAsset.id,
            beforeAnimation.id,
            beforeAnimation.frames,
            afterAnimation.frames,
          ),
        );
      }
    }
    const beforeMetadata = projectMetadata(before);
    const afterMetadata = projectMetadata(after);
    if (!jsonEqual(beforeMetadata, afterMetadata))
      patches.push({
        type: "project.metadata.changed",
        before: beforeMetadata,
        after: afterMetadata,
      });
  }
  if (!patches.length) return null;
  return command(before, after, type, patches, params, source);
}

export function createSetPixelCommand(
  projectInput: unknown,
  x: number,
  y: number,
  color: Pixel,
  frameId?: string,
  layerId?: string,
  source?: string,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = frameId ? getFrame(after, frameId) : activeFrameOf(after);
  const layer = layerId
    ? frame?.layers.find((l) => l.id === layerId)
    : frame
      ? activeLayerOf(frame)
      : null;
  if (!frame || !layer) return null;
  setPixel(layer, x, y, color);
  return createProjectCommand(
    before,
    after,
    "setPixel",
    { x, y, color, frameId: frame.id, layerId: layer.id },
    source,
  );
}

export function createDrawLineCommand(
  projectInput: unknown,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness = 1,
  frameId?: string,
  layerId?: string,
  source?: string,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = frameId ? getFrame(after, frameId) : activeFrameOf(after);
  const layer = layerId
    ? frame?.layers.find((l) => l.id === layerId)
    : frame
      ? activeLayerOf(frame)
      : null;
  if (!frame || !layer) return null;
  drawLine(layer, x1, y1, x2, y2, color, thickness);
  return createProjectCommand(
    before,
    after,
    "drawLine",
    { x1, y1, x2, y2, color, thickness, frameId: frame.id, layerId: layer.id },
    source,
  );
}

export function createDrawRectCommand(
  projectInput: unknown,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Pixel,
  frameId?: string,
  layerId?: string,
  source?: string,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = frameId ? getFrame(after, frameId) : activeFrameOf(after);
  const layer = layerId
    ? frame?.layers.find((l) => l.id === layerId)
    : frame
      ? activeLayerOf(frame)
      : null;
  if (!frame || !layer) return null;
  drawRect(layer, x, y, w, h, color);
  return createProjectCommand(
    before,
    after,
    "drawRect",
    { x, y, w, h, color, frameId: frame.id, layerId: layer.id },
    source,
  );
}

export function createDrawEllipseCommand(
  projectInput: unknown,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Pixel,
  frameId?: string,
  layerId?: string,
  source?: string,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = frameId ? getFrame(after, frameId) : activeFrameOf(after);
  const layer = layerId
    ? frame?.layers.find((l) => l.id === layerId)
    : frame
      ? activeLayerOf(frame)
      : null;
  if (!frame || !layer) return null;
  drawEllipse(layer, x, y, rx, ry, color);
  return createProjectCommand(
    before,
    after,
    "drawEllipse",
    { x, y, rx, ry, color, frameId: frame.id, layerId: layer.id },
    source,
  );
}

export function createFloodFillCommand(
  projectInput: unknown,
  x: number,
  y: number,
  color: Pixel,
  frameId?: string,
  layerId?: string,
  source?: string,
) {
  const before = expandProject(projectInput);
  const after = expandProject(before);
  const frame = frameId ? getFrame(after, frameId) : activeFrameOf(after);
  const layer = layerId
    ? frame?.layers.find((l) => l.id === layerId)
    : frame
      ? activeLayerOf(frame)
      : null;
  if (!frame || !layer || x < 0 || y < 0 || x >= SIZE || y >= SIZE)
    return null;
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  const fillColor = color === null ? null : normHex(color);
  const target = pixels[indexOf(x, y)];
  if (target === fillColor) return null;
  const q: Array<[number, number]> = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
    const i = indexOf(cx, cy);
    if (pixels[i] !== target) continue;
    pixels[i] = fillColor;
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return createProjectCommand(
    before,
    after,
    "floodFill",
    { x, y, color: fillColor, frameId: frame.id, layerId: layer.id },
    source,
  );
}

function getAnimation(project: Project, assetId: string, animationId: string) {
  return project.assets
    .find((asset) => asset.id === assetId)
    ?.animations.find((animation) => animation.id === animationId);
}

function reorderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

function setProjectMetadata(project: Project, metadata: ProjectMetadata) {
  for (const assetMetadata of metadata.assets) {
    const asset = project.assets.find((item) => item.id === assetMetadata.id);
    if (!asset) continue;
    asset.name = assetMetadata.name;
    asset.palette = clone(assetMetadata.palette);
    asset.exportProfiles = clone(assetMetadata.exportProfiles);
    for (const animationMetadata of assetMetadata.animations) {
      const animation = asset.animations.find(
        (item) => item.id === animationMetadata.id,
      );
      if (!animation) continue;
      Object.assign(animation, clone(animationMetadata));
    }
  }
  project.activeAssetId = metadata.activeAssetId;
  project.activeAnimationId = metadata.activeAnimationId;
  project.activeFrameId = metadata.activeFrameId;
  project.palette = clone(metadata.palette);
  project.background = clone(metadata.background);
  project.quality = clone(metadata.quality || {});
  return expandProject(project);
}

export function applyPatch(projectInput: unknown, patch: HistoryPatch): Project {
  let project = expandProject(projectInput);
  if (patch.type === "project.replaced") return expandProject(patch.after);
  if (patch.type === "pixels.changed") {
    const pixels = withLayerPixels(project, patch.frameId, patch.layerId);
    if (!pixels) return project;
    for (const change of patch.changes) pixels[change.index] = change.after;
    return expandProject(project);
  }
  if (patch.type === "layer.added") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.layers.splice(patch.index, 0, clone(patch.layer));
    frame.activeLayerId = patch.activeLayerIdAfter;
    return expandProject(project);
  }
  if (patch.type === "layer.removed") {
    const frame = getFrame(project, patch.frameId);
    if (!frame || frame.layers.length <= 1) return project;
    frame.layers = frame.layers.filter((layer) => layer.id !== patch.layer.id);
    frame.activeLayerId = patch.activeLayerIdAfter;
    return expandProject(project);
  }
  if (patch.type === "layer.updated") {
    const layer = getLayer(project, patch.frameId, patch.layerId);
    if (!layer) return project;
    Object.assign(layer, clone(patch.after));
    return expandProject(project);
  }
  if (patch.type === "layer.order.changed") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.layers = reorderByIds(frame.layers, patch.after);
    return expandProject(project);
  }
  if (patch.type === "frame.updated") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    Object.assign(frame, clone(patch.after));
    return expandProject(project);
  }
  if (patch.type === "frame.added") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation) return project;
    animation.frames.splice(patch.index, 0, clone(patch.frame));
    project.activeFrameId = patch.activeFrameIdAfter;
    return expandProject(project);
  }
  if (patch.type === "frame.removed") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation || animation.frames.length <= 1) return project;
    animation.frames = animation.frames.filter((frame) => frame.id !== patch.frame.id);
    project.activeFrameId = patch.activeFrameIdAfter;
    return expandProject(project);
  }
  if (patch.type === "frame.order.changed") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation) return project;
    animation.frames = reorderByIds(animation.frames, patch.after);
    return expandProject(project);
  }
  if (patch.type === "project.metadata.changed")
    return setProjectMetadata(project, patch.after);
  return expandProject(project);
}

export function revertPatch(projectInput: unknown, patch: HistoryPatch): Project {
  let project = expandProject(projectInput);
  if (patch.type === "project.replaced") return expandProject(patch.before);
  if (patch.type === "pixels.changed") {
    const pixels = withLayerPixels(project, patch.frameId, patch.layerId);
    if (!pixels) return project;
    for (const change of patch.changes) pixels[change.index] = change.before;
    return expandProject(project);
  }
  if (patch.type === "layer.added") {
    const frame = getFrame(project, patch.frameId);
    if (!frame || frame.layers.length <= 1) return project;
    frame.layers = frame.layers.filter((layer) => layer.id !== patch.layer.id);
    frame.activeLayerId = patch.activeLayerIdBefore;
    return expandProject(project);
  }
  if (patch.type === "layer.removed") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.layers.splice(patch.index, 0, clone(patch.layer));
    frame.activeLayerId = patch.activeLayerIdBefore;
    return expandProject(project);
  }
  if (patch.type === "layer.updated") {
    const layer = getLayer(project, patch.frameId, patch.layerId);
    if (!layer) return project;
    Object.assign(layer, clone(patch.before));
    return expandProject(project);
  }
  if (patch.type === "layer.order.changed") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.layers = reorderByIds(frame.layers, patch.before);
    return expandProject(project);
  }
  if (patch.type === "frame.updated") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    Object.assign(frame, clone(patch.before));
    return expandProject(project);
  }
  if (patch.type === "frame.added") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation || animation.frames.length <= 1) return project;
    animation.frames = animation.frames.filter((frame) => frame.id !== patch.frame.id);
    project.activeFrameId = patch.activeFrameIdBefore;
    return expandProject(project);
  }
  if (patch.type === "frame.removed") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation) return project;
    animation.frames.splice(patch.index, 0, clone(patch.frame));
    project.activeFrameId = patch.activeFrameIdBefore;
    return expandProject(project);
  }
  if (patch.type === "frame.order.changed") {
    const animation = getAnimation(project, patch.assetId, patch.animationId);
    if (!animation) return project;
    animation.frames = reorderByIds(animation.frames, patch.before);
    return expandProject(project);
  }
  if (patch.type === "project.metadata.changed")
    return setProjectMetadata(project, patch.before);
  return expandProject(project);
}

export function applyCommand(
  projectInput: unknown,
  historyCommand: HistoryCommand,
) {
  return historyCommand.patches.reduce(
    (project, patch) => applyPatch(project, patch),
    expandProject(projectInput),
  );
}

export function revertCommand(
  projectInput: unknown,
  historyCommand: HistoryCommand,
) {
  return [...historyCommand.patches].reverse().reduce(
    (project, patch) => revertPatch(project, patch),
    expandProject(projectInput),
  );
}

export function isHistoryCommand(input: any): input is HistoryCommand {
  return Boolean(
    input &&
      typeof input === "object" &&
      input.command &&
      typeof input.command.type === "string" &&
      Array.isArray(input.patches),
  );
}
