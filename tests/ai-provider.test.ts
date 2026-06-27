import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  expandPixels,
  expandProject,
  indexOf,
} from "../shared/pixel-core.ts";
import { HttpAIProvider } from "../server/ai/http-ai-provider.ts";
import { LocalHeuristicProvider } from "../server/ai/local-heuristic-provider.ts";
import { FallbackAIProvider } from "../server/ai/fallback-ai-provider.ts";
import {
  AiProviderError,
  type AIProvider,
} from "../server/ai/AIProvider.ts";

function listenJson(
  handler: (body: any, req: http.IncomingMessage) => any | Promise<any>,
) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      try {
        const payload = await handler(raw ? JSON.parse(raw) : {}, req);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      } catch (error: any) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error?.message || "failed" }));
      }
    });
  });
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/generate`,
      });
    });
  });
}

test("local heuristic provider remains the fallback provider", async () => {
  const provider = new LocalHeuristicProvider();
  const result = await provider.generate({
    prompt: "crie uma espada pequena",
    operation: "generate",
    project: expandProject({}),
  });

  assert.equal(result.providerKind, "heuristic");
  assert.equal(result.provider, "local-heuristic");
  assert.ok(result.project.frames.length >= 1);
});

test("HTTP AI provider sends prompt/project constraints and applies diff", async () => {
  let received: any = null;
  const { server, url } = await listenJson((body, req) => {
    received = { body, authorization: req.headers.authorization };
    return {
      provider: "test-http",
      model: "pixel-json",
      diff: {
        frameIndex: 0,
        layerName: "Base",
        changes: [{ x: 4, y: 5, color: "#123456" }],
      },
    };
  });
  try {
    const provider = new HttpAIProvider(url, "secret");
    const result = await provider.generate({
      prompt: "pinte um ponto",
      operation: "edit_selection",
      project: expandProject({}),
      selection: { x: 0, y: 0, w: 16, h: 16 },
      palette: ["#000000", "#ffffff"],
      maxColors: 2,
    });
    const pixels = expandPixels(activeLayerOf(activeFrameOf(result.project)).pixels);

    assert.equal(received.authorization, "Bearer secret");
    assert.equal(received.body.prompt, "pinte um ponto");
    assert.equal(received.body.project.format, "pixel-art-compact-v1");
    assert.equal(received.body.constraints.size, 256);
    assert.deepEqual(received.body.palette, ["#000000", "#ffffff"]);
    assert.equal(result.provider, "test-http");
    assert.equal(result.model, "pixel-json");
    assert.equal(pixels[indexOf(4, 5)], "#000000");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("HTTP AI provider rejects invalid provider payloads", async () => {
  const { server, url } = await listenJson(() => ({ ok: true }));
  try {
    const provider = new HttpAIProvider(url);
    await assert.rejects(
      () =>
        provider.generate({
          prompt: "sem projeto",
          operation: "generate",
          project: expandProject({}),
        }),
      /ai_provider_invalid_payload_.*AI response must include project, frames or diff/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("HTTP AI provider aborts requests that exceed its timeout", async () => {
  const { server, url } = await listenJson(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { project: expandProject({}) };
  });
  try {
    const provider = new HttpAIProvider(url, undefined, { timeoutMs: 20 });
    await assert.rejects(
      () =>
        provider.generate({
          prompt: "demore de propósito",
          project: expandProject({}),
        }),
      /ai_provider_timeout_20/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("HTTP AI provider rejects responses above the configured size limit", async () => {
  const { server, url } = await listenJson(() => ({
    project: expandProject({}),
    padding: "x".repeat(2_000),
  }));
  try {
    const provider = new HttpAIProvider(url, undefined, {
      maxResponseBytes: 256,
    });
    await assert.rejects(
      () =>
        provider.generate({
          prompt: "resposta limitada",
          project: expandProject({}),
        }),
      /ai_provider_response_too_large_256/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("configured external provider falls back safely to the heuristic provider", async () => {
  const fakeExternal: AIProvider = {
    name: "fake-external",
    kind: "external-ai",
    async generate() {
      throw new AiProviderError("fake_timeout");
    },
  };
  const provider = new FallbackAIProvider(
    fakeExternal,
    new LocalHeuristicProvider(),
  );
  const result = await provider.generate({
    prompt: "crie um escudo",
    project: expandProject({}),
  });

  assert.equal(result.provider, "local-heuristic");
  assert.equal(result.providerKind, "heuristic");
  assert.deepEqual(result.fallback, {
    provider: "fake-external",
    code: "fake_timeout",
  });
  assert.ok(result.warnings?.includes("external_provider_failed:fake_timeout"));
});

test("invalid prompts are rejected before calling an external provider", async () => {
  const provider = new HttpAIProvider("http://127.0.0.1:1/generate");
  await assert.rejects(
    () => provider.generate({ prompt: "   ", project: expandProject({}) }),
    /ai_request_invalid_prompt/,
  );
});
