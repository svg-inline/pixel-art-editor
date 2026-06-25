import {
  createVariation,
  editSelection,
  expandProject,
  generatePixelArtFromPrompt,
  limitColors,
  replaceGlobalColor,
} from "../../shared/pixel-core.ts";
import {
  postProcessAiProject,
  type AiProviderResult,
  type AiRequest,
  type AIProvider,
} from "./AIProvider.ts";

export class LocalHeuristicProvider implements AIProvider {
  name = "local-heuristic";
  kind = "local" as const;

  async generate(input: AiRequest): Promise<AiProviderResult> {
    const op = input.operation || "generate";
    const base = expandProject(input.project || {});
    let project = base;
    if (op === "edit" || op === "edit_selection" || op === "replace_subject")
      project = editSelection(base, input.prompt, input.selection, input.layer);
    else if (op === "create_variation")
      project = createVariation(base, input.prompt || "mirror_h");
    else if (op === "recolor_palette")
      project = replaceGlobalColor(
        base,
        input.from || "#ffffff",
        input.to || "#000000",
      );
    else if (input.maxColors) project = limitColors(base, input.maxColors);
    else project = generatePixelArtFromPrompt(input.prompt, base);

    return {
      project: postProcessAiProject(project, input),
      provider: this.name,
      providerKind: this.kind,
      warnings: ["heuristic_provider_not_real_ai"],
    };
  }
}
