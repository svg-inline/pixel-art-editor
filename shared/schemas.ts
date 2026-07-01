import { z } from "zod";

export const EXPORT_PRESET_IDS = [
  "generic_png",
  "spritesheet_grid",
  "godot_4",
  "unity_2d",
  "aseprite_json",
  "web_preview",
] as const;

export const ExportPresetIdSchema = z.enum(EXPORT_PRESET_IDS);
export type ExportPresetId = z.infer<typeof ExportPresetIdSchema>;

const BoxKindSchema = z.enum(["hitbox", "hurtbox", "attackbox"]);
const BackgroundSchema = z.object({
  mode: z.enum(["project", "transparent", "color"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
});
const CropSchema = z.object({
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  w: z.number().int().min(1).max(256),
  h: z.number().int().min(1).max(256),
});

export const ExportProfileSchema = z.object({
  id: z.string().min(1),
  preset: ExportPresetIdSchema,
  name: z.string().min(1),
  engine: z.enum(["godot", "unity", "generic"]),
  format: z.enum(["png", "spritesheet", "json", "web"]),
  scope: z.enum(["active_animation", "all_animations"]),
  directions: z.array(z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])),
  scale: z.number().int().min(1).max(16),
  padding: z.number().int().min(0).max(256),
  spacing: z.number().int().min(0).max(256),
  trim: z.boolean(),
  crop: CropSchema.nullable(),
  background: BackgroundSchema,
  pixelsPerUnit: z.number().positive().optional(),
  qaMode: z.enum(["warning", "block"]),
  binaryAlpha: z.boolean(),
  maxColors: z.number().int().min(2).max(256),
  minMargin: z.number().int().min(0).max(64),
  centerTolerance: z.number().int().min(0).max(128),
  requirePivot: z.boolean(),
  requiredBoxes: z.array(BoxKindSchema),
});

export type ExportProfile = z.infer<typeof ExportProfileSchema>;

type PresetDefaults = Omit<ExportProfile, "id">;

export const EXPORT_PROFILE_PRESETS: Record<ExportPresetId, PresetDefaults> = {
  generic_png: {
    preset: "generic_png", name: "PNG genérico", engine: "generic", format: "png",
    scope: "active_animation", directions: [], scale: 1, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "project", color: "#0f172a" },
    qaMode: "warning", binaryAlpha: true, maxColors: 32, minMargin: 0,
    centerTolerance: 14, requirePivot: false, requiredBoxes: [],
  },
  spritesheet_grid: {
    preset: "spritesheet_grid", name: "Spritesheet grid", engine: "generic", format: "spritesheet",
    scope: "active_animation", directions: [], scale: 1, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "project", color: "#0f172a" },
    qaMode: "warning", binaryAlpha: true, maxColors: 32, minMargin: 1,
    centerTolerance: 14, requirePivot: false, requiredBoxes: [],
  },
  godot_4: {
    preset: "godot_4", name: "Godot 4", engine: "godot", format: "spritesheet",
    scope: "all_animations", directions: [], scale: 1, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "project", color: "#0f172a" },
    pixelsPerUnit: 256, qaMode: "warning", binaryAlpha: true, maxColors: 32,
    minMargin: 1, centerTolerance: 14, requirePivot: true, requiredBoxes: [],
  },
  unity_2d: {
    preset: "unity_2d", name: "Unity 2D", engine: "unity", format: "spritesheet",
    scope: "all_animations", directions: [], scale: 1, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "project", color: "#0f172a" },
    pixelsPerUnit: 256, qaMode: "warning", binaryAlpha: true, maxColors: 32,
    minMargin: 1, centerTolerance: 14, requirePivot: true, requiredBoxes: [],
  },
  aseprite_json: {
    preset: "aseprite_json", name: "Aseprite JSON", engine: "generic", format: "json",
    scope: "active_animation", directions: [], scale: 1, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "project", color: "#0f172a" },
    qaMode: "warning", binaryAlpha: true, maxColors: 256, minMargin: 0,
    centerTolerance: 128, requirePivot: false, requiredBoxes: [],
  },
  web_preview: {
    preset: "web_preview", name: "Web preview", engine: "generic", format: "web",
    scope: "active_animation", directions: [], scale: 2, padding: 0, spacing: 0,
    trim: false, crop: null, background: { mode: "transparent", color: "#0f172a" },
    qaMode: "warning", binaryAlpha: true, maxColors: 256, minMargin: 0,
    centerTolerance: 128, requirePivot: false, requiredBoxes: [],
  },
};

export function createExportProfile(preset: ExportPresetId, overrides: Record<string, unknown> = {}) {
  return ExportProfileSchema.parse({
    ...EXPORT_PROFILE_PRESETS[preset],
    id: preset,
    ...overrides,
    preset,
  });
}

export function normalizeExportProfiles(input: unknown): ExportProfile[] {
  const source = Array.isArray(input) ? input : [];
  return EXPORT_PRESET_IDS.map((preset) => {
    const defaults = EXPORT_PROFILE_PRESETS[preset];
    const legacyEngine = preset === "godot_4" ? "godot" : preset === "unity_2d" ? "unity" : null;
    const saved = source.find((item: any) => item?.preset === preset) ||
      (legacyEngine ? source.find((item: any) => !item?.preset && item?.engine === legacyEngine) : undefined);
    const merged = {
      ...defaults,
      ...saved,
      id: saved?.id || preset,
      preset,
      background: { ...defaults.background, ...(saved?.background || {}) },
    };
    const parsed = ExportProfileSchema.safeParse(merged);
    return parsed.success ? parsed.data : createExportProfile(preset);
  });
}
