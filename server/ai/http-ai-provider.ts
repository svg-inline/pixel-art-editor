import {
  AiProviderError,
  AiProviderResponseSchema,
  buildAiPayload,
  DEFAULT_AI_MAX_RESPONSE_BYTES,
  DEFAULT_AI_TIMEOUT_MS,
  projectFromAiResponse,
  validateAiRequest,
  type AiProviderResult,
  type AiRequest,
  type AIProvider,
} from "./AIProvider.ts";

export class HttpAIProvider implements AIProvider {
  name = "http-ai";
  kind = "external-ai" as const;

  constructor(
    private endpoint: string,
    private token?: string,
    private options: {
      timeoutMs?: number;
      maxResponseBytes?: number;
    } = {},
  ) {}

  async generate(input: AiRequest): Promise<AiProviderResult> {
    const validated = validateAiRequest(input);
    const timeoutMs = positiveLimit(
      this.options.timeoutMs,
      DEFAULT_AI_TIMEOUT_MS,
    );
    const maxResponseBytes = positiveLimit(
      this.options.maxResponseBytes,
      DEFAULT_AI_MAX_RESPONSE_BYTES,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(buildAiPayload(validated)),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new AiProviderError(`ai_provider_http_${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json"))
        throw new AiProviderError("ai_provider_invalid_content_type");
      const raw = await readLimitedResponse(response, maxResponseBytes);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (error) {
        throw new AiProviderError("ai_provider_invalid_json", true, {
          cause: error,
        });
      }
      const parsed = AiProviderResponseSchema.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
          .join("; ");
        throw new AiProviderError(`ai_provider_invalid_payload_${issues}`);
      }
      const payload = parsed.data;
      return {
        project: projectFromAiResponse(payload, validated),
        provider: payload.provider || this.name,
        providerKind: this.kind,
        model: payload.model,
        warnings: payload.warnings,
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted)
        throw new AiProviderError(`ai_provider_timeout_${timeoutMs}`, true, {
          cause: error,
        });
      throw new AiProviderError("ai_provider_network_error", true, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function positiveLimit(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : fallback;
}

async function readLimitedResponse(response: Response, limit: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit)
    throw new AiProviderError(`ai_provider_response_too_large_${limit}`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new AiProviderError(`ai_provider_response_too_large_${limit}`);
    }
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}
