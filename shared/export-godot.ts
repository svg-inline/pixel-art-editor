import {
  activeAnimationOf,
  activeAssetOf,
  frameBoxes,
  frameBoxesOfKind,
  frameDurationMs,
} from "./animation.ts";
import { expandProject, SIZE, slug } from "./model.ts";

export function godotMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const activeAsset = activeAssetOf(project);
  const profile =
    activeAsset.exportProfiles.find((item) => item.engine === "godot") ||
    activeAsset.exportProfiles[0];
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  const maxFrames = Math.max(
    1,
    ...activeAsset.animations.map((animation) => animation.frames.length),
  );
  const animations = activeAsset.animations.map((animation, row) => ({
    id: animation.id,
    name: slug(animation.name),
    source_name: animation.name,
    direction: animation.direction,
    fps: animation.fps,
    loop: animation.loop,
    pivot: animation.pivot,
    frames: animation.frames.length,
    layout: "horizontal",
    row,
    frame_rects: animation.frames.map((frame, i) => ({
      x: i * SIZE,
      y: row * SIZE,
      w: SIZE,
      h: SIZE,
      durationMs: frameDurationMs(frame, animation),
      duration: frameDurationMs(frame, animation),
      pivot: frame.pivot,
      pivot_override: frame.pivotOverride,
      hitboxes: frameBoxes(frame).map((hitbox) => ({
        ...hitbox,
        type: hitbox.kind,
      })),
      hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
      attackboxes: frameBoxesOfKind(frame, "attackbox"),
    })),
  }));
  return {
    asset,
    active_animation: anim,
    source_asset: activeAsset.name,
    engine: "godot",
    godot_version: "4.x",
    frame_width: SIZE,
    frame_height: SIZE,
    sheet: {
      layout: "animation_rows",
      columns: maxFrames,
      rows: activeAsset.animations.length,
      width: SIZE * maxFrames,
      height: SIZE * activeAsset.animations.length,
    },
    background: project.background,
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

export function atlasMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const animation = activeAnimationOf(project);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  return {
    meta: {
      image: `${asset}_${anim}_sheet.png`,
      size: { w: SIZE * project.frames.length, h: SIZE },
      scale: 1,
    },
    frames: Object.fromEntries(
      project.frames.map((frame, i) => [
        `${anim}_${String(i).padStart(2, "0")}`,
        {
          frame: { x: i * SIZE, y: 0, w: SIZE, h: SIZE },
          durationMs: frameDurationMs(frame, animation),
          duration: frameDurationMs(frame, animation),
          pivot: frame.pivot,
          pivot_override: frame.pivotOverride,
          hitboxes: frameBoxes(frame).map((hitbox) => ({
            ...hitbox,
            type: hitbox.kind,
          })),
          hurtboxes: frameBoxesOfKind(frame, "hurtbox"),
          attackboxes: frameBoxesOfKind(frame, "attackbox"),
        },
      ]),
    ),
  };
}
