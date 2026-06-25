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

function listenJson(handler: (body: any, req: http.IncomingMessage) => any) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        const payload = handler(raw ? JSON.parse(raw) : {}, req);
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

  assert.equal(result.providerKind, "local");
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

test("HTTP AI provider rejects invalid JSON responses", async () => {
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
      /AI response must include project, frames or diff/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
