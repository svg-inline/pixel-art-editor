import assert from "node:assert/strict";
import test from "node:test";
import type http from "node:http";
import {
  assertBridgeSecurity,
  bridgeSecurityConfig,
  corsHeaders,
  isOriginAllowed,
  isTokenValid,
} from "../server/bridge-security.ts";

function req(headers: Record<string, string> = {}) {
  return { headers } as http.IncomingMessage;
}

test("production bridge requires a token", () => {
  const config = bridgeSecurityConfig({
    NODE_ENV: "production",
    PIXEL_BRIDGE_ALLOWED_ORIGINS: "http://localhost:5173",
  });

  assert.throws(() => assertBridgeSecurity(config), /PIXEL_BRIDGE_TOKEN/);
});

test("CORS only allows configured editor origins", () => {
  const config = bridgeSecurityConfig({
    NODE_ENV: "production",
    PIXEL_BRIDGE_TOKEN: "secret",
    PIXEL_BRIDGE_ALLOWED_ORIGINS: "http://localhost:5173",
  });

  assert.equal(isOriginAllowed("http://localhost:5173", config), true);
  assert.equal(isOriginAllowed("http://localhost:9999", config), false);
  assert.equal(
    corsHeaders(req({ origin: "http://localhost:9999" }), config)[
      "access-control-allow-origin"
    ],
    "null",
  );
});

test("token validation accepts header, bearer and SSE query token", () => {
  const config = bridgeSecurityConfig({
    NODE_ENV: "production",
    PIXEL_BRIDGE_TOKEN: "secret",
  });

  assert.equal(isTokenValid(req({ "x-pixel-token": "secret" }), config), true);
  assert.equal(
    isTokenValid(req({ authorization: "Bearer secret" }), config),
    true,
  );
  assert.equal(
    isTokenValid(req(), config, new URLSearchParams("token=secret")),
    true,
  );
  assert.equal(isTokenValid(req(), config, new URLSearchParams()), false);
});
