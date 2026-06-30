import {
  activeAnimationOf,
  activeAssetOf,
  frameBoxes,
  frameBoxesOfKind,
  frameDurationMs,
} from "./animation.ts";
import { expandProject, SIZE, slug } from "./model.ts";

export function unityMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const activeAsset = activeAssetOf(project);
  const activeAnimation = activeAnimationOf(project);
  const asset = slug(activeAsset.name);
  const anim = slug(activeAnimation.name);
  const profile =
    activeAsset.exportProfiles.find((item) => item.engine === "unity") ||
    activeAsset.exportProfiles[0];
  const pixelsPerUnit = profile?.pixelsPerUnit || SIZE;
  const maxFrames = Math.max(
    1,
    ...activeAsset.animations.map((animation) => animation.frames.length),
  );

  const animations = activeAsset.animations.map((animation, row) => ({
    id: animation.id,
    name: slug(animation.name),
    sourceName: animation.name,
    direction: animation.direction,
    fps: animation.fps,
    loop: animation.loop,
    pivot: animation.pivot,
    row,
    frames: animation.frames.map((frame, index) => ({
      id: frame.id,
      name: `${slug(animation.name)}_${index}`,
      x: index * SIZE,
      y: row * SIZE,
      width: SIZE,
      height: SIZE,
      pivot: { x: frame.pivot.x / SIZE, y: frame.pivot.y / SIZE },
      pivotPixels: frame.pivot,
      pivotOverride: frame.pivotOverride,
      durationMs: frameDurationMs(frame, animation),
      duration: frameDurationMs(frame, animation),
      hitboxes: frameBoxes(frame).map((box) => ({ ...box, type: box.kind })),
      hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
      attackboxes: frameBoxesOfKind(frame, "attackbox"),
    })),
  }));
  const active =
    animations.find((animation) => animation.id === activeAnimation.id) ||
    animations[0];

  return {
    asset,
    sourceAsset: activeAsset.name,
    engine: "unity",
    background: project.background,
    exportProfile: profile,
    pixelsPerUnit,
    filterMode: "Point",
    compression: "None",
    spriteMode: "Multiple",
    sheet: `${asset}_sheet.png`,
    activeSheet: `${asset}_${anim}_sheet.png`,
    sheetLayout: {
      layout: "animation_rows",
      columns: maxFrames,
      rows: animations.length,
      width: maxFrames * SIZE,
      height: animations.length * SIZE,
    },
    animations,
    // Compatibility view used by the existing single-animation importer.
    frames: active.frames,
  };
}
