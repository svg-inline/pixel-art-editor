import {
  AiProviderResponseSchema,
  buildAiPayload,
  projectFromAiResponse,
  type AiProviderResult,
  type AiRequest,
  type AIProvider,
} from "./AIProvider.ts";

export class HttpAIProvider implements AIProvider {
  name = "http-ai";
  kind = "http" as const;

  constructor(
    private endpoint: string,
    private token?: string,
  ) {}

  async generate(input: AiRequest): Promise<AiProviderResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(buildAiPayload(input)),
    });
    if (!response.ok) throw new Error(`ai_provider_http_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("image/png"))
      throw new Error("ai_provider_png_response_requires_decoder");
    if (!contentType.includes("application/json"))
      throw new Error("ai_provider_invalid_content_type");
    const payload = AiProviderResponseSchema.parse(await response.json());
    return {
      project: projectFromAiResponse(payload, input),
      provider: payload.provider || this.name,
      providerKind: this.kind,
      model: payload.model,
      warnings: payload.warnings,
    };
  }
}
