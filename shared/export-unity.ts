import {
  activeAnimationOf,
  activeAssetOf,
  frameBoxes,
  frameBoxesOfKind,
  frameDurationMs,
} from "./animation.ts";
import { expandProject, SIZE, slug } from "./model.ts";
import { boxInExportedFrame, exportProfileOf, pointInExportedFrame, spritesheetPlan } from "./export-profiles.ts";

export function unityMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const activeAsset = activeAssetOf(project);
  const activeAnimation = activeAnimationOf(project);
  const asset = slug(activeAsset.name);
  const anim = slug(activeAnimation.name);
  const profile = exportProfileOf(project, "unity_2d");
  const plan = spritesheetPlan(project, profile);
  const pixelsPerUnit = profile?.pixelsPerUnit || SIZE;
  const animations = activeAsset.animations
    .filter((animation) => plan.frames.some((item) => item.animationId === animation.id))
    .map((animation) => ({
    id: animation.id,
    name: slug(animation.name),
    sourceName: animation.name,
    direction: animation.direction,
    fps: animation.fps,
    loop: animation.loop,
    pivot: animation.pivot,
    row: plan.frames.find((item) => item.animationId === animation.id)?.row || 0,
    frames: animation.frames.map((frame, index) => {
      const placement = plan.frames.find((item) => item.animationId === animation.id && item.frameIndex === index)!;
      return ({
      id: frame.id,
      name: `${slug(animation.name)}_${index}`,
      x: placement.destination.x,
      y: placement.destination.y,
      width: placement.destination.w,
      height: placement.destination.h,
      sourceRect: placement.source,
      sourceSize: placement.sourceSize,
      trimmed: placement.trimmed,
      pivot: {
        x: (frame.pivot.x - placement.source.x) / placement.source.w,
        y: (frame.pivot.y - placement.source.y) / placement.source.h,
      },
      pivotPixels: frame.pivot,
      pivotInSprite: pointInExportedFrame(frame.pivot, placement),
      pivotOverride: frame.pivotOverride,
      durationMs: frameDurationMs(frame, animation),
      duration: frameDurationMs(frame, animation),
      hitboxes: frameBoxes(frame).map((box) => ({ ...box, type: box.kind })),
      hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
      attackboxes: frameBoxesOfKind(frame, "attackbox"),
      exportBoxes: frameBoxes(frame).map((box) => ({
        ...boxInExportedFrame(box, placement), type: box.kind,
      })),
    });}),
  }));
  const active =
    animations.find((animation) => animation.id === activeAnimation.id) ||
    animations[0];

  return {
    asset,
    sourceAsset: activeAsset.name,
    engine: "unity",
    background: plan.background,
    exportProfile: profile,
    pixelsPerUnit,
    filterMode: "Point",
    compression: "None",
    spriteMode: "Multiple",
    sheet: `${asset}_sheet.png`,
    activeSheet: `${asset}_${anim}_sheet.png`,
    sheetLayout: {
      layout: "animation_rows",
      columns: plan.columns,
      rows: plan.rows,
      width: plan.width,
      height: plan.height,
      padding: profile.padding,
      spacing: profile.spacing,
      scale: profile.scale,
      trim: profile.trim,
    },
    animations,
    // Compatibility view used by the existing single-animation importer.
    frames: active.frames,
  };
}
