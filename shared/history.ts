import {
  activeFrameOf,
  activeLayerOf,
  clone,
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

export type FramePatch = {
  type: "frame.updated";
  frameId: string;
  before: {
    name: string;
    duration: number;
    pivot: Project["frames"][number]["pivot"];
    pivotOverride: boolean;
    hitboxes: Project["frames"][number]["hitboxes"];
  };
  after: {
    name: string;
    duration: number;
    pivot: Project["frames"][number]["pivot"];
    pivotOverride: boolean;
    hitboxes: Project["frames"][number]["hitboxes"];
  };
};

export type ProjectReplacePatch = {
  type: "project.replaced";
  before: ReturnType<typeof compactProject>;
  after: ReturnType<typeof compactProject>;
};

export type HistoryPatch =
  | PixelPatch
  | LayerPatch
  | FramePatch
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
  | "mcp.diff";

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
    command: { type, label: labelFor(type), params, source },
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    patches,
  };
}

function labelFor(type: HistoryCommandName) {
  return type
    .replace(".", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function getFrame(project: Project, frameId: string) {
  return project.frames.find((frame) => frame.id === frameId);
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

function stripPixels(project: Project) {
  const p = clone(project) as any;
  delete p.revision;
  for (const frame of p.frames || [])
    for (const layer of frame.layers || []) layer.pixels = "__pixels__";
  for (const asset of p.assets || [])
    for (const animation of asset.animations || [])
      for (const frame of animation.frames || [])
        for (const layer of frame.layers || []) layer.pixels = "__pixels__";
  return p;
}

function sameStructure(before: Project, after: Project) {
  if (JSON.stringify(stripPixels(before)) !== JSON.stringify(stripPixels(after)))
    return false;
  return true;
}

function sameFrameTopology(before: Project, after: Project) {
  if (before.frames.length !== after.frames.length) return false;
  for (let i = 0; i < before.frames.length; i++) {
    const beforeFrame = before.frames[i];
    const afterFrame = after.frames[i];
    if (beforeFrame.id !== afterFrame.id) return false;
    if (beforeFrame.layers.length !== afterFrame.layers.length) return false;
    for (let j = 0; j < beforeFrame.layers.length; j++) {
      if (beforeFrame.layers[j].id !== afterFrame.layers[j].id) return false;
    }
  }
  return true;
}

function framePatchFromFrames(
  beforeFrame: Project["frames"][number],
  afterFrame: Project["frames"][number],
): FramePatch | null {
  if (
    beforeFrame.name === afterFrame.name &&
    beforeFrame.duration === afterFrame.duration &&
    JSON.stringify(beforeFrame.pivot) === JSON.stringify(afterFrame.pivot) &&
    beforeFrame.pivotOverride === afterFrame.pivotOverride &&
    JSON.stringify(beforeFrame.hitboxes) === JSON.stringify(afterFrame.hitboxes)
  )
    return null;
  return {
    type: "frame.updated",
    frameId: beforeFrame.id,
    before: {
      name: beforeFrame.name,
      duration: beforeFrame.duration,
      pivot: clone(beforeFrame.pivot),
      pivotOverride: beforeFrame.pivotOverride,
      hitboxes: clone(beforeFrame.hitboxes),
    },
    after: {
      name: afterFrame.name,
      duration: afterFrame.duration,
      pivot: clone(afterFrame.pivot),
      pivotOverride: afterFrame.pivotOverride,
      hitboxes: clone(afterFrame.hitboxes),
    },
  };
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
  if (sameStructure(before, after)) {
    for (const beforeFrame of before.frames) {
      const afterFrame = after.frames.find((frame) => frame.id === beforeFrame.id);
      if (!afterFrame) continue;
      for (const beforeLayer of beforeFrame.layers) {
        const afterLayer = afterFrame.layers.find((layer) => layer.id === beforeLayer.id);
        if (!afterLayer) continue;
        const patch = pixelPatchFromLayers(
          beforeFrame.id,
          beforeLayer.id,
          beforeLayer,
          afterLayer,
        );
        if (patch) patches.push(patch);
      }
    }
  } else if (sameFrameTopology(before, after)) {
    for (const beforeFrame of before.frames) {
      const afterFrame = after.frames.find((frame) => frame.id === beforeFrame.id);
      if (!afterFrame) continue;
      const framePatch = framePatchFromFrames(beforeFrame, afterFrame);
      if (framePatch) patches.push(framePatch);
      for (const beforeLayer of beforeFrame.layers) {
        const afterLayer = afterFrame.layers.find(
          (layer) => layer.id === beforeLayer.id,
        );
        if (!afterLayer) continue;
        const pixelPatch = pixelPatchFromLayers(
          beforeFrame.id,
          beforeLayer.id,
          beforeLayer,
          afterLayer,
        );
        if (pixelPatch) patches.push(pixelPatch);
      }
    }
  } else {
    patches.push({
      type: "project.replaced",
      before: compactProject(before),
      after: compactProject(after),
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
  }
  if (patch.type === "frame.updated") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.name = patch.after.name;
    frame.duration = patch.after.duration;
    frame.pivot = clone(patch.after.pivot);
    frame.pivotOverride = patch.after.pivotOverride;
    frame.hitboxes = clone(patch.after.hitboxes);
    return expandProject(project);
  }
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
  }
  if (patch.type === "frame.updated") {
    const frame = getFrame(project, patch.frameId);
    if (!frame) return project;
    frame.name = patch.before.name;
    frame.duration = patch.before.duration;
    frame.pivot = clone(patch.before.pivot);
    frame.pivotOverride = patch.before.pivotOverride;
    frame.hitboxes = clone(patch.before.hitboxes);
    return expandProject(project);
  }
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
