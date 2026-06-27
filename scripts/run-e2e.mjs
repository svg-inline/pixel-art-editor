import { spawn } from "node:child_process";
import process from "node:process";

const bridgePort = "8788";
const webPort = "5174";
const children = [];

function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`E2E server did not become ready: ${url}`);
}

async function stopChildren() {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolve();
          child.once("exit", resolve);
          child.kill();
          setTimeout(resolve, 2_000).unref();
        }),
    ),
  );
}

let exitCode = 1;
try {
  start(["--import", "tsx", "server/bridge-server.ts"], {
    PIXEL_BRIDGE_PORT: bridgePort,
    PIXEL_BRIDGE_HOST: "127.0.0.1",
    PIXEL_SQLITE_PATH: "runtime/e2e-test.sqlite",
    PIXEL_AI_PROVIDER: "local",
    PIXEL_BRIDGE_ALLOWED_ORIGINS: `http://localhost:${webPort},http://127.0.0.1:${webPort}`,
  });
  start(["node_modules/vite/bin/vite.js", "--port", webPort], {
    VITE_PIXEL_BRIDGE_URL: `http://localhost:${bridgePort}`,
  });

  await Promise.all([
    waitFor(`http://localhost:${bridgePort}/api/project`, 15_000),
    waitFor(`http://localhost:${webPort}`, 30_000),
  ]);

  const playwright = start([
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2),
  ]);
  exitCode = await new Promise((resolve) =>
    playwright.once("exit", (code) => resolve(code ?? 1)),
  );
} catch (error) {
  console.error(error);
} finally {
  await stopChildren();
}

process.exitCode = exitCode;
