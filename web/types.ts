import type {
  PixelSelectionClip,
  Project,
  Selection,
} from "../shared/pixel-core.ts";

export type Tool =
  | "pencil"
  | "eraser"
  | "bucket"
  | "picker"
  | "select"
  | "dither"
  | "line"
  | "rect"
  | "ellipse"
  | "wand"
  | "lasso";

export type SymmetryMode = "none" | "horizontal" | "vertical" | "both";

export type AiOperation =
  | "generate"
  | "edit_selection"
  | "edit"
  | "create_variation";

export type GridMode = "auto" | "manual";
export type GridDensity = "compacta" | "normal" | "limpa";

export type BridgeStatus =
  | "offline"
  | "online"
  | "sync"
  | "erro"
  | "saved"
  | "loaded"
  | "gallery-saved"
  | "prompt"
  | "local-prompt"
  | "conflict";

export type AiFlowState =
  | "idle"
  | "validating"
  | "sending_to_provider"
  | "preview_ready"
  | "accepted"
  | "rejected"
  | "failed_with_recoverable_error";

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export type Point = Pick<Selection, "x" | "y">;
export type Clip = PixelSelectionClip;

export type GalleryItem = {
  id: string;
  name: string;
  frames: number;
};

export type AiPreviewState = {
  id?: string;
  project: Project;
  provider: string;
  providerKind: "heuristic" | "external-ai";
  model?: string;
  warnings?: string[];
  fallback?: { provider: string; code: string };
  prompt: string;
  operation: AiOperation;
  source?: "ai" | "mcp";
  summary?: {
    operations: number;
    pixelChanges: number;
    structuralChanges: number;
    replacesProject: boolean;
    colorsAfter: number;
  };
};

export type RemoteHistoryItem = {
  id: string;
  at: string;
  command: string;
  label?: string;
  source?: string;
  tool?: string;
  prompt?: string;
  timestamp?: string;
  result?: AiFlowState;
  provider?: string;
  providerKind?: "heuristic" | "external-ai";
  patches: number;
  pixelChanges: number;
  params?: Record<string, unknown>;
};

export type ShapeTool = Extract<Tool, "line" | "rect" | "ellipse">;

export type ShapePreviewState = {
  tool: ShapeTool;
  start: Point;
  end: Point;
};

export const DEFAULT_ZOOM = 3;
export const AUTOSAVE_DEBOUNCE_MS = 900;
export const DEFAULT_ANIMS = [
  "idle",
  "walk",
  "attack",
  "dodge",
  "skill",
  "death",
];

export const TOOL_NAMES: Tool[] = [
  "pencil",
  "eraser",
  "bucket",
  "picker",
  "select",
  "dither",
  "line",
  "rect",
  "ellipse",
  "wand",
  "lasso",
];

export const TOOL_LABELS: Record<Tool, string> = {
  pencil: "Lápis",
  eraser: "Borracha",
  bucket: "Balde",
  picker: "Conta-gotas",
  select: "Seleção retangular",
  dither: "Dither",
  line: "Linha",
  rect: "Retângulo",
  ellipse: "Elipse",
  wand: "Varinha mágica",
  lasso: "Laço livre",
};

export const AUTOSAVE_LABELS: Record<AutosaveStatus, string> = {
  idle: "aguardando",
  dirty: "pendente",
  saving: "salvando",
  saved: "salvo",
  error: "erro",
  conflict: "conflito",
};
