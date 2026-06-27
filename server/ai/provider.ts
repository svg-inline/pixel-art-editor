import process from "node:process";
import { HttpAIProvider } from "./http-ai-provider.ts";
import { LocalHeuristicProvider } from "./local-heuristic-provider.ts";
import { FallbackAIProvider } from "./fallback-ai-provider.ts";
import type { AIProvider } from "./AIProvider.ts";
export {
  AiProviderError,
  AiOperationSchema,
  buildAiPayload,
  projectFromAiResponse,
  type AiOperation,
  type AiProviderResult,
  type AiProviderKind,
  type AiRequest,
  type AIProvider,
} from "./AIProvider.ts";
export { HttpAIProvider } from "./http-ai-provider.ts";
export { LocalHeuristicProvider } from "./local-heuristic-provider.ts";
export { FallbackAIProvider } from "./fallback-ai-provider.ts";

export function createAiProvider(): AIProvider {
  const endpoint = process.env.PIXEL_AI_ENDPOINT;
  if (endpoint) {
    const external = new HttpAIProvider(endpoint, process.env.PIXEL_AI_API_KEY, {
      timeoutMs: envPositiveInt("PIXEL_AI_TIMEOUT_MS"),
      maxResponseBytes: envPositiveInt("PIXEL_AI_MAX_RESPONSE_BYTES"),
    });
    return new FallbackAIProvider(external, new LocalHeuristicProvider());
  }
  return new LocalHeuristicProvider();
}

function envPositiveInt(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
