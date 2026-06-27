import assert from "node:assert/strict";
import test from "node:test";
import { AiProviderResponseSchema } from "../server/ai/AIProvider.ts";
import { expandProject } from "../shared/pixel-core.ts";
import {
  AnimationSchema,
  AssetSchema,
  FrameSchema,
  FrameUpdatedOperationSchema,
  GodotMetaSchema,
  HitboxSchema,
  LayerSchema,
  PointSchema,
  ProjectBackgroundSchema,
  ProjectInputSchema,
  ProjectSchema,
} from "../shared/schema.ts";

// ─── Helper: build a minimal valid expanded project ───────────────────────────

function validProject() {
  return expandProject({ godot: { asset: "hero", animation: "idle_w" } });
}

// ─── ProjectInputSchema ───────────────────────────────────────────────────────

test("ProjectInputSchema rejects a non-object payload (string)", () => {
  const result = ProjectInputSchema.safeParse("not-an-object");
  assert.equal(result.success, false);
});

test("ProjectInputSchema rejects payload where assets is not an array", () => {
  const result = ProjectInputSchema.safeParse({ assets: "should-be-array" });
  assert.equal(result.success, false);
});

test("ProjectInputSchema rejects payload where frames is not an array", () => {
  const result = ProjectInputSchema.safeParse({ frames: 42 });
  assert.equal(result.success, false);
});

test("ProjectInputSchema rejects negative revision", () => {
  const result = ProjectInputSchema.safeParse({ revision: -1 });
  assert.equal(result.success, false);
});

test("ProjectInputSchema accepts a valid partial project", () => {
  const result = ProjectInputSchema.safeParse({
    revision: 0,
    assets: [],
    godot: { asset: "hero" },
  });
  assert.equal(result.success, true);
});

// ─── ProjectSchema (strict normalized) ────────────────────────────────────────

test("ProjectSchema validates a properly expanded project", () => {
  const project = validProject();
  const result = ProjectSchema.safeParse(project);
  assert.equal(
    result.success,
    true,
    JSON.stringify(result.error?.issues ?? []),
  );
});

test("ProjectSchema rejects project with invalid schemaVersion", () => {
  const project = { ...validProject(), schemaVersion: 1 as unknown as 2 };
  const result = ProjectSchema.safeParse(project);
  assert.equal(result.success, false);
});

test("ProjectSchema rejects project where assets is an empty array", () => {
  const project = { ...validProject(), assets: [] };
  const result = ProjectSchema.safeParse(project);
  assert.equal(result.success, false);
});

test("ProjectSchema rejects palette with invalid hex color", () => {
  const project = { ...validProject(), palette: ["not-a-hex", "#ffffff"] };
  const result = ProjectSchema.safeParse(project);
  assert.equal(result.success, false);
});

test("ProjectSchema rejects project with invalid background mode", () => {
  const project = {
    ...validProject(),
    background: { mode: "rainbow" as "color", color: "#000000" },
  };
  const result = ProjectSchema.safeParse(project);
  assert.equal(result.success, false);
});

// ─── LayerSchema ──────────────────────────────────────────────────────────────

test("LayerSchema rejects opacity > 1", () => {
  const result = LayerSchema.safeParse({
    id: "l1",
    name: "Base",
    visible: true,
    opacity: 1.5,
    pixels: [],
  });
  assert.equal(result.success, false);
});

test("LayerSchema rejects opacity < 0", () => {
  const result = LayerSchema.safeParse({
    id: "l1",
    name: "Base",
    visible: true,
    opacity: -0.1,
    pixels: [],
  });
  assert.equal(result.success, false);
});

test("LayerSchema rejects non-object pixels", () => {
  const result = LayerSchema.safeParse({
    id: "l1",
    name: "Base",
    visible: true,
    opacity: 1,
    pixels: "invalid",
  });
  assert.equal(result.success, false);
});

// ─── FrameSchema ──────────────────────────────────────────────────────────────

test("FrameSchema rejects duration = 0", () => {
  const validFrame = expandProject({}).frames[0];
  const result = FrameSchema.safeParse({ ...validFrame, duration: 0 });
  assert.equal(result.success, false);
});

test("FrameSchema rejects duration > 5000", () => {
  const validFrame = expandProject({}).frames[0];
  const result = FrameSchema.safeParse({ ...validFrame, duration: 5001 });
  assert.equal(result.success, false);
});

test("FrameSchema rejects empty layers array", () => {
  const validFrame = expandProject({}).frames[0];
  const result = FrameSchema.safeParse({ ...validFrame, layers: [] });
  assert.equal(result.success, false);
});

// ─── PointSchema / pivot ──────────────────────────────────────────────────────

test("PointSchema rejects negative x coordinate", () => {
  const result = PointSchema.safeParse({ x: -1, y: 0 });
  assert.equal(result.success, false);
});

test("PointSchema rejects y coordinate > 255", () => {
  const result = PointSchema.safeParse({ x: 0, y: 256 });
  assert.equal(result.success, false);
});

// ─── HitboxSchema ─────────────────────────────────────────────────────────────

test("HitboxSchema rejects w = 0", () => {
  const result = HitboxSchema.safeParse({
    id: "h1",
    name: "attack",
    kind: "attackbox",
    x: 0,
    y: 0,
    w: 0,
    h: 8,
  });
  assert.equal(result.success, false);
});

test("HitboxSchema rejects negative x", () => {
  const result = HitboxSchema.safeParse({
    id: "h1",
    name: "hit",
    kind: "hitbox",
    x: -5,
    y: 0,
    w: 8,
    h: 8,
  });
  assert.equal(result.success, false);
});

test("HitboxSchema rejects invalid kind", () => {
  const result = HitboxSchema.safeParse({
    id: "h1",
    name: "bad",
    kind: "damagebox",
    x: 0,
    y: 0,
    w: 8,
    h: 8,
  });
  assert.equal(result.success, false);
});

// ─── AnimationSchema ──────────────────────────────────────────────────────────

test("AnimationSchema rejects fps = 0", () => {
  const project = validProject();
  const anim = project.assets[0].animations[0];
  const result = AnimationSchema.safeParse({ ...anim, fps: 0 });
  assert.equal(result.success, false);
});

test("AnimationSchema rejects invalid direction", () => {
  const project = validProject();
  const anim = project.assets[0].animations[0];
  const result = AnimationSchema.safeParse({
    ...anim,
    direction: "X" as "N",
  });
  assert.equal(result.success, false);
});

test("AnimationSchema rejects empty frames array", () => {
  const project = validProject();
  const anim = project.assets[0].animations[0];
  const result = AnimationSchema.safeParse({ ...anim, frames: [] });
  assert.equal(result.success, false);
});

// ─── GodotMetaSchema ──────────────────────────────────────────────────────────

test("GodotMetaSchema rejects invalid direction", () => {
  const result = GodotMetaSchema.safeParse({
    asset: "hero",
    animation: "idle_w",
    direction: "DIAGONAL" as "N",
    fps: 6,
    loop: true,
  });
  assert.equal(result.success, false);
});

// ─── ProjectBackgroundSchema ──────────────────────────────────────────────────

test("ProjectBackgroundSchema rejects invalid mode", () => {
  const result = ProjectBackgroundSchema.safeParse({
    mode: "gradient",
    color: "#000000",
  });
  assert.equal(result.success, false);
});

test("ProjectBackgroundSchema rejects invalid color hex", () => {
  const result = ProjectBackgroundSchema.safeParse({
    mode: "color",
    color: "red",
  });
  assert.equal(result.success, false);
});

// ─── FrameUpdatedOperationSchema ──────────────────────────────────────────────

test("FrameUpdatedOperationSchema rejects pivot with x > 255", () => {
  const result = FrameUpdatedOperationSchema.safeParse({
    type: "frame.updated",
    frameId: "f1",
    before: { name: "Frame 1", duration: 100, pivot: { x: 300, y: 0 } },
    after: { name: "Frame 1", duration: 150, pivot: { x: 128, y: 128 } },
  });
  assert.equal(result.success, false);
});

test("FrameUpdatedOperationSchema rejects hitbox with invalid kind", () => {
  const result = FrameUpdatedOperationSchema.safeParse({
    type: "frame.updated",
    frameId: "f1",
    before: {
      name: "Frame 1",
      duration: 100,
      hitboxes: [
        { id: "h1", name: "bad", kind: "badbox", x: 0, y: 0, w: 8, h: 8 },
      ],
    },
    after: { name: "Frame 1", duration: 100 },
  });
  assert.equal(result.success, false);
});

// ─── AssetSchema ──────────────────────────────────────────────────────────────

test("AssetSchema rejects empty animations array", () => {
  const project = validProject();
  const asset = project.assets[0];
  const result = AssetSchema.safeParse({ ...asset, animations: [] });
  assert.equal(result.success, false);
});

test("AssetSchema rejects empty exportProfiles array", () => {
  const project = validProject();
  const asset = project.assets[0];
  const result = AssetSchema.safeParse({ ...asset, exportProfiles: [] });
  assert.equal(result.success, false);
});

// ─── AiProviderResponseSchema ─────────────────────────────────────────────────

test("AiProviderResponseSchema rejects response missing project, frames and diff", () => {
  const result = AiProviderResponseSchema.safeParse({
    provider: "test-ai",
    model: "gpt-4",
  });
  assert.equal(result.success, false);
});

test("AiProviderResponseSchema accepts response with project field", () => {
  const result = AiProviderResponseSchema.safeParse({
    provider: "test-ai",
    project: { revision: 0 },
  });
  assert.equal(result.success, true);
});

test("AiProviderResponseSchema accepts response with frames field", () => {
  const result = AiProviderResponseSchema.safeParse({
    frames: [{ id: "f1", name: "Frame 1", duration: 100 }],
  });
  assert.equal(result.success, true);
});
