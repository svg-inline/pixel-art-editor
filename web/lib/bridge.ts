const BRIDGE_URL =
  import.meta.env.VITE_PIXEL_BRIDGE_URL || "http://localhost:8787";
const BRIDGE_TOKEN = import.meta.env.VITE_PIXEL_BRIDGE_TOKEN || "";

export function bridgeUrl(path: string, includeToken = false) {
  const url = new URL(path, BRIDGE_URL);
  if (includeToken && BRIDGE_TOKEN) url.searchParams.set("token", BRIDGE_TOKEN);
  return url.toString();
}

function bridgeHeaders(headers?: HeadersInit) {
  const out = new Headers(headers);
  if (BRIDGE_TOKEN) out.set("x-pixel-token", BRIDGE_TOKEN);
  return out;
}

export function bridgeFetch(path: string, init: RequestInit = {}) {
  return fetch(bridgeUrl(path), {
    ...init,
    headers: bridgeHeaders(init.headers),
  });
}
