import { expandProject, SIZE, slug } from "./model.ts";

export function unityMetadata(projectInput: any) {
  const project = expandProject(projectInput);
  const asset = slug(project.godot.asset),
    anim = slug(project.godot.animation);
  return {
    asset,
    engine: "unity",
    background: project.background,
    pixelsPerUnit: SIZE,
    filterMode: "Point",
    compression: "None",
    spriteMode: "Multiple",
    sheet: `${asset}_${anim}_sheet.png`,
    frames: project.frames.map((frame, i) => ({
      name: `${anim}_${i}`,
      x: i * SIZE,
      y: 0,
      width: SIZE,
      height: SIZE,
      pivot: { x: frame.pivot.x / SIZE, y: frame.pivot.y / SIZE },
      duration: frame.duration || Math.round(1000 / project.godot.fps),
      hitboxes: frame.hitboxes.map((hitbox) => ({
        ...hitbox,
        type: hitbox.kind,
      })),
    })),
  };
}
