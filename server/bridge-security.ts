import type http from "node:http";

export type BridgeSecurityConfig = {
  token: string;
  devMode: boolean;
  allowedOrigins: string[];
};

const DEFAULT_EDITOR_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function splitCsv(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function bridgeSecurityConfig(env = process.env): BridgeSecurityConfig {
  const devMode =
    env.PIXEL_BRIDGE_DEV === "1" ||
    env.PIXEL_BRIDGE_SECURITY === "dev" ||
    env.NODE_ENV !== "production";
  const allowedOrigins = splitCsv(env.PIXEL_BRIDGE_ALLOWED_ORIGINS).length
    ? splitCsv(env.PIXEL_BRIDGE_ALLOWED_ORIGINS)
    : DEFAULT_EDITOR_ORIGINS;
  return {
    token: env.PIXEL_BRIDGE_TOKEN || "",
    devMode,
    allowedOrigins,
  };
}

export function assertBridgeSecurity(config: BridgeSecurityConfig) {
  if (!config.devMode && !config.token) {
    throw new Error(
      "PIXEL_BRIDGE_TOKEN is required when NODE_ENV=production. Set PIXEL_BRIDGE_DEV=1 only for local development.",
    );
  }
}

export function requestOrigin(req: http.IncomingMessage) {
  const origin = req.headers.origin;
  return typeof origin === "string" ? origin : "";
}

export function isOriginAllowed(origin: string, config: BridgeSecurityConfig) {
  if (!origin) return true;
  return config.allowedOrigins.includes(origin);
}

export function corsHeaders(
  req: http.IncomingMessage,
  config: BridgeSecurityConfig,
) {
  const origin = requestOrigin(req);
  const allowedOrigin = isOriginAllowed(origin, config)
    ? origin || config.allowedOrigins[0] || "http://127.0.0.1:5173"
    : "null";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "content-type,x-pixel-token,authorization",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

export function requestToken(
  req: http.IncomingMessage,
  searchParams?: URLSearchParams,
) {
  const headerToken = req.headers["x-pixel-token"];
  const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/)
    ?.[1];
  const queryToken = searchParams?.get("token") || "";
  return String(
    Array.isArray(headerToken) ? headerToken[0] : headerToken || bearer || queryToken,
  );
}

export function isTokenValid(
  req: http.IncomingMessage,
  config: BridgeSecurityConfig,
  searchParams?: URLSearchParams,
) {
  if (!config.token) return config.devMode;
  return requestToken(req, searchParams) === config.token;
}
