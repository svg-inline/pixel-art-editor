import {
  blankFrame,
  clone,
  expandProject,
  uid,
  type Animation,
  type Asset,
  type BoxKind,
  type Frame,
  type Hitbox,
  type Layer,
  type Project,
} from "./model.ts";

export function frameDurationMs(frame: Frame, animation?: Animation) {
  return Math.max(
    1,
    Math.min(
      5000,
      Math.round(
        Number(frame.durationMs ?? frame.duration) ||
          Math.round(1000 / Math.max(1, animation?.fps || 10)),
      ),
    ),
  );
}

/** Returns the canonical, de-duplicated compatibility view of all frame boxes. */
export function frameBoxes(frame: Frame): Hitbox[] {
  const all = [
    ...(frame.hitboxes || []),
    ...(frame.hurtboxes || []).map((box) => ({ ...box, kind: "hurtbox" as const })),
    ...(frame.attackboxes || []).map((box) => ({
      ...box,
      kind: "attackbox" as const,
    })),
  ];
  const seen = new Set<string>();
  return all.filter((box) => {
    if (seen.has(box.id)) return false;
    seen.add(box.id);
    return true;
  });
}

export function frameBoxesOfKind(frame: Frame, kind: BoxKind) {
  return frameBoxes(frame).filter((box) => box.kind === kind);
}

export function activeAssetOf(project: Project) {
  return (
    project.assets.find((asset) => asset.id === project.activeAssetId) ||
    project.assets[0]
  );
}

export function activeAnimationOf(project: Project) {
  const asset = activeAssetOf(project);
  return (
    asset.animations.find(
      (animation) => animation.id === project.activeAnimationId,
    ) || asset.animations[0]
  );
}

export function setActiveAnimationFrames(project: Project, frames: Frame[]) {
  const animation = activeAnimationOf(project);
  animation.frames = frames;
  project.frames = animation.frames;
  project.activeFrameId = frames.some(
    (frame) => frame.id === project.activeFrameId,
  )
    ? project.activeFrameId
    : frames[0]?.id || "";
  return project;
}

export function syncActiveAnimationMeta(project: Project) {
  const asset = activeAssetOf(project);
  const animation = activeAnimationOf(project);
  asset.name = project.godot.asset || asset.name;
  asset.palette = project.palette?.length ? project.palette : asset.palette;
  animation.name = project.godot.animation || animation.name;
  animation.direction = project.godot.direction;
  animation.fps = project.godot.fps;
  animation.loop = project.godot.loop;
  return project;
}

export function activeFrameOf(project: Project) {
  return (
    project.frames.find((f) => f.id === project.activeFrameId) ||
    project.frames[0]
  );
}

export function activeLayerOf(frame: Frame) {
  return (
    frame.layers.find((l) => l.id === frame.activeLayerId) || frame.layers[0]
  );
}

export function layerByName(frame: Frame, name?: string): Layer | undefined {
  return name
    ? frame.layers.find((l) => l.id === name || l.name === name)
    : activeLayerOf(frame);
}

export function frameByName(project: Project, name?: string) {
  return name
    ? project.frames.find((f) => f.id === name || f.name === name)
    : activeFrameOf(project);
}

export function extendAnimation(projectInput: any, totalFrames = 8): Project {
  const project = expandProject(projectInput);
  const clamped = Math.max(1, Math.min(64, Math.round(totalFrames)));
  while (project.frames.length < clamped) {
    const source = clone(
      project.frames[
        project.frames.length % Math.max(1, project.frames.length)
      ] || blankFrame(),
    );
    source.id = uid();
    source.name = `Frame ${project.frames.length + 1}`;
    source.layers.forEach((layer: Layer, i: number) => {
      layer.id = uid();
      if (i === 0) source.activeLayerId = layer.id;
    });
    project.frames.push(source);
  }
  return project;
}
