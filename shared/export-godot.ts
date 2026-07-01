import {
  activeAnimationOf,
  activeAssetOf,
  frameBoxes,
  frameBoxesOfKind,
  frameDurationMs,
} from "./animation.ts";
import { expandProject, SIZE, slug } from "./model.ts";
import { boxInExportedFrame, exportProfileOf, pointInExportedFrame, spritesheetPlan } from "./export-profiles.ts";
import type { ExportPresetId, ExportProfile } from "./schemas.ts";

export function godotMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const activeAsset = activeAssetOf(project);
  const profile = exportProfileOf(project, "godot_4");
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  const plan = spritesheetPlan(project, profile);
  const animations = activeAsset.animations
    .filter((animation) => plan.frames.some((item) => item.animationId === animation.id))
    .map((animation) => ({
    id: animation.id,
    name: slug(animation.name),
    source_name: animation.name,
    direction: animation.direction,
    fps: animation.fps,
    loop: animation.loop,
    pivot: animation.pivot,
    frames: animation.frames.length,
    layout: "horizontal",
    row: plan.frames.find((item) => item.animationId === animation.id)?.row || 0,
    frame_rects: animation.frames.map((frame, i) => {
      const placement = plan.frames.find((item) => item.animationId === animation.id && item.frameIndex === i)!;
      return ({
      x: placement.destination.x,
      y: placement.destination.y,
      w: placement.destination.w,
      h: placement.destination.h,
      source_rect: placement.source,
      source_size: placement.sourceSize,
      trimmed: placement.trimmed,
      durationMs: frameDurationMs(frame, animation),
      duration: frameDurationMs(frame, animation),
      pivot: frame.pivot,
      pivot_in_frame: pointInExportedFrame(frame.pivot, placement),
      pivot_override: frame.pivotOverride,
      hitboxes: frameBoxes(frame).map((hitbox) => ({
        ...hitbox,
        type: hitbox.kind,
      })),
      hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
      attackboxes: frameBoxesOfKind(frame, "attackbox"),
      export_hitboxes: frameBoxes(frame).map((hitbox) => ({
        ...boxInExportedFrame(hitbox, placement), type: hitbox.kind,
      })),
    });}),
  }));
  return {
    asset,
    active_animation: anim,
    source_asset: activeAsset.name,
    engine: "godot",
    godot_version: "4.x",
    frame_width: SIZE * profile.scale,
    frame_height: SIZE * profile.scale,
    sheet: {
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
    background: plan.background,
    export_profile: profile,
    pixels_per_unit: profile?.pixelsPerUnit || SIZE,
    import: {
      filter: false,
      mipmaps: false,
      repeat: "disabled",
      compression: "lossless",
      texture_type: "2D",
      filter_mode: "nearest",
      pixel_art: true,
    },
    files: {
      spritesheet: `res://assets/${asset}/spritesheets/${asset}_${anim}_sheet.png`,
      asset_spritesheet: `res://assets/${asset}/spritesheets/${asset}_sheet.png`,
      atlas: `res://assets/${asset}/metadata/${asset}_${anim}.atlas.json`,
      metadata: `res://assets/${asset}/metadata/${asset}.animations.json`,
      spriteframes: `res://assets/${asset}/${asset}.spriteframes.tres`,
    },
    animations,
    collision: animations.flatMap((animation) =>
      animation.frame_rects.flatMap((frame, frameIndex) =>
        frame.hitboxes.map((hitbox) => ({
          animation: animation.name,
          frame: frameIndex,
          ...hitbox,
          type: hitbox.kind,
        })),
      ),
    ),
  };
}

export function atlasMetadata(projectInput: any, profileInput: ExportProfile | ExportPresetId | string = "spritesheet_grid") {
  const project = expandProject(projectInput);
  const animation = activeAnimationOf(project);
  const activeAsset = activeAssetOf(project);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  const profile = typeof profileInput === "string" ? exportProfileOf(project, profileInput) : profileInput;
  const plan = spritesheetPlan(project, profile);
  return {
    meta: {
      image: `${asset}_${anim}_sheet.png`,
      size: { w: plan.width, h: plan.height },
      scale: profile.scale,
      padding: profile.padding,
      spacing: profile.spacing,
      trim: profile.trim,
      background: plan.background,
    },
    frames: Object.fromEntries(
      plan.frames.map((placement) => {
        const frame = placement.frame;
        const sourceAnimation = activeAsset.animations.find((item) => item.id === placement.animationId) || animation;
        const frameName = plan.rows > 1 ? slug(sourceAnimation.name) : anim;
        return [
        `${frameName}_${String(placement.frameIndex).padStart(2, "0")}`,
        {
          frame: placement.destination,
          rotated: false,
          trimmed: placement.trimmed,
          spriteSourceSize: placement.source,
          sourceSize: placement.sourceSize,
          animation: sourceAnimation.name,
          direction: sourceAnimation.direction,
          durationMs: frameDurationMs(frame, sourceAnimation),
          duration: frameDurationMs(frame, sourceAnimation),
          pivot: frame.pivot,
          pivotInSprite: pointInExportedFrame(frame.pivot, placement),
          pivot_override: frame.pivotOverride,
          hitboxes: frameBoxes(frame).map((hitbox) => ({
            ...hitbox,
            type: hitbox.kind,
          })),
          hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
          attackboxes: frameBoxesOfKind(frame, "attackbox"),
          exportBoxes: frameBoxes(frame).map((box) => ({
            ...boxInExportedFrame(box, placement), type: box.kind,
          })),
        },
      ];}),
    ),
  };
}
