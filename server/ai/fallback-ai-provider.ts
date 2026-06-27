import {
  AiProviderError,
  type AIProvider,
  type AiProviderResult,
  type AiRequest,
} from "./AIProvider.ts";

export class FallbackAIProvider implements AIProvider {
  name: string;
  kind = "external-ai" as const;

  constructor(
    private primary: AIProvider,
    private fallback: AIProvider,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async generate(input: AiRequest): Promise<AiProviderResult> {
    try {
      return await this.primary.generate(input);
    } catch (error) {
      if (error instanceof AiProviderError && !error.recoverable) throw error;
      const code =
        error instanceof AiProviderError
          ? error.code
          : error instanceof Error
            ? error.message
            : "ai_provider_unknown_error";
      const result = await this.fallback.generate(input);
      return {
        ...result,
        warnings: [
          ...(result.warnings || []),
          `external_provider_failed:${code}`,
        ],
        fallback: {
          provider: this.primary.name,
          code,
        },
      };
    }
  }
}
