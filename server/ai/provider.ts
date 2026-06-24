import process from "node:process";
import {
  createVariation,
  editSelection,
  expandProject,
  generatePixelArtFromPrompt,
  limitColors,
  replaceGlobalColor,
  type Project,
  type Selection,
} from "../../shared/pixel-core.ts";

export type AiOperation =
  | "generate"
  | "edit"
  | "edit_selection"
  | "replace_subject"
  | "create_variation"
  | "recolor_palette"
  | "extend_animation";
export type AiRequest = {
  prompt: string;
  operation?: AiOperation;
  project?: unknown;
  selection?: Selection | null;
  layer?: string;
  from?: string;
  to?: string;
  maxColors?: number;
};
export type AiProvider = {
  name: string;
  run(input: AiRequest): Promise<Project>;
};

class LocalHeuristicProvider implements AiProvider {
  name = "local-heuristic";
  async run(input: AiRequest) {
    const op = input.operation || "generate";
    const base = expandProject(input.project || {});
    if (op === "edit" || op === "edit_selection" || op === "replace_subject")
      return editSelection(base, input.prompt, input.selection, input.layer);
    if (op === "create_variation")
      return createVariation(base, input.prompt || "mirror_h");
    if (op === "recolor_palette")
      return replaceGlobalColor(
        base,
        input.from || "#ffffff",
        input.to || "#000000",
      );
    if (input.maxColors) return limitColors(base, input.maxColors);
    return generatePixelArtFromPrompt(input.prompt, base);
  }
}

class HttpJsonProvider implements AiProvider {
  name = "http-json";
  constructor(
    private endpoint: string,
    private token?: string,
  ) {}
  async run(input: AiRequest) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AI provider HTTP ${response.status}`);
    const payload: any = await response.json();
    return expandProject(payload.project || payload);
  }
}

export function createAiProvider(): AiProvider {
  const endpoint = process.env.PIXEL_AI_ENDPOINT;
  if (endpoint)
    return new HttpJsonProvider(endpoint, process.env.PIXEL_AI_API_KEY);
  return new LocalHeuristicProvider();
}
