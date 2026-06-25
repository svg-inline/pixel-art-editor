import process from "node:process";
import { HttpAIProvider } from "./http-ai-provider.ts";
import { LocalHeuristicProvider } from "./local-heuristic-provider.ts";
import type { AIProvider } from "./AIProvider.ts";
export {
  AiOperationSchema,
  buildAiPayload,
  projectFromAiResponse,
  type AiOperation,
  type AiProviderResult,
  type AiRequest,
  type AIProvider,
} from "./AIProvider.ts";
export { HttpAIProvider } from "./http-ai-provider.ts";
export { LocalHeuristicProvider } from "./local-heuristic-provider.ts";

export function createAiProvider(): AIProvider {
  const endpoint = process.env.PIXEL_AI_ENDPOINT;
  if (endpoint)
    return new HttpAIProvider(endpoint, process.env.PIXEL_AI_API_KEY);
  return new LocalHeuristicProvider();
}
