/**
 * E2E tests — fluxos principais do editor pixel art.
 *
 * Cada teste cobre um fluxo de ponta a ponta que antes só era
 * validado manualmente. Os testes não dependem de IA externa:
 * a bridge usa o provider heurístico local (PIXEL_AI_PROVIDER=local).
 *
 * Estrutura:
 *   - beforeEach: limpa localStorage + reseta estado da bridge
 *   - waitForApp / waitForBridgeConnected: helpers sem sleeps fixos
 */
import { expect, test, type Page } from "@playwright/test";
import { minimalProject } from "./fixtures/minimal-project.ts";

const BRIDGE = "http://localhost:8788";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Aguarda o app React renderizar os painéis principais. */
async function waitForApp(page: Page) {
  await page.locator("h2", { hasText: "Camadas" }).waitFor({ timeout: 10_000 });
}

/**
 * Aguarda a bridge sincronizar o projeto via SSE.
 * O status muda de "offline" → "online" → "sync" → "online".
 */
async function waitForBridgeConnected(page: Page) {
  const aiStatus = page.locator(".status").filter({ hasText: "Bridge:" });

  // `onopen` muda a bridge para online antes de o primeiro evento `project`
  // ser aplicado. "Autosave: salvo" só aparece depois que esse projeto inicial
  // foi processado, evitando que ele sobrescreva uma interação do teste.
  await expect(aiStatus).toContainText("Autosave: salvo", { timeout: 8_000 });
  await expect(aiStatus).toContainText("Bridge: online", { timeout: 8_000 });
}

/** Lê a revisão atual do projeto da bridge. */
async function getBridgeRevision(page: Page): Promise<number> {
  const res = await page.request.get(`${BRIDGE}/api/project`);
  const data = (await res.json()) as { revision?: number };
  return data.revision ?? 0;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // Limpa localStorage antes que os scripts da página carreguem.
  await page.addInitScript(() => localStorage.clear());

  // Cria um projeto novo e determinístico sem verificação de revisão.
  await page.request.post(`${BRIDGE}/api/project`, {
    data: minimalProject,
    headers: { "content-type": "application/json" },
  });

  await page.goto("/");
  await waitForApp(page);
  await waitForBridgeConnected(page);
});

// ─── 1. Carregamento do editor ────────────────────────────────────────────────

test.describe("Editor carrega", () => {
  test("novo projeto abre com todos os painéis e o canvas", async ({
    page,
  }) => {
    await expect(page.locator("h1")).toHaveText("Pixel ART 256");
    await expect(page.getByLabel("Asset", { exact: true })).toHaveValue(
      "e2e_fixture",
    );
    await expect(page.locator("h2", { hasText: "IA / MCP" })).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Godot / Unity" }),
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Preview animado" }),
    ).toBeVisible();
    await expect(page.locator("h2", { hasText: "Camadas" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Seleção" })).toBeVisible();
    await expect(page.locator("section.stage canvas")).toBeVisible();
  });
});

// ─── 2. Canvas — desenho de pixel ─────────────────────────────────────────────

test.describe("Canvas", () => {
  test("roda aplica zoom sem aviso de listener passivo", async ({ page }) => {
    const passiveWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Unable to preventDefault inside passive event listener"))
        passiveWarnings.push(message.text());
    });
    const canvas = page.locator("section.stage canvas");
    const before = Number(await canvas.getAttribute("width"));
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -100);

    await expect.poll(async () => Number(await canvas.getAttribute("width"))).toBeGreaterThan(before);
    expect(passiveWarnings).toEqual([]);
  });

  test("clique no canvas dispara autosave na bridge", async ({ page }) => {
    const canvas = page.locator("section.stage canvas");
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const revBefore = await getBridgeRevision(page);

    // Configura escuta ANTES do clique para não perder o request de autosave
    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/project") && r.request().method() === "POST",
      { timeout: 5_000 },
    );

    // Clica no centro do canvas com a ferramenta padrão (pencil)
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    const res = await saveResponse;
    expect(res.ok()).toBe(true);

    const revAfter = await getBridgeRevision(page);
    expect(revAfter).toBeGreaterThan(revBefore);
  });

  test("seleção copiar e colar não quebra o editor", async ({ page }) => {
    const canvas = page.locator("section.stage canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const offset = Math.min(box!.width, box!.height) * 0.25;

    // Ativa a ferramenta select
    await page.locator(".tools button", { hasText: "select" }).click();

    // Arrasta para criar seleção
    await page.mouse.move(cx - offset, cy - offset);
    await page.mouse.down();
    await page.mouse.move(cx + offset, cy + offset);
    await page.mouse.up();

    // Copia (sem erro)
    await page.locator("button", { hasText: "copiar" }).click();

    // Cola (sem erro; o clipboard está definido mesmo que os pixels sejam nulos)
    await page.locator("button", { hasText: "colar" }).click();

    // Editor permanece funcional após operação
    await expect(page.locator("h2", { hasText: "Camadas" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Seleção" })).toBeVisible();
  });
});

// ─── 3. Camadas ───────────────────────────────────────────────────────────────

test.describe("Camadas", () => {
  test("cria nova camada e aparece na lista", async ({ page }) => {
    const initialCount = await page.locator(".layer").count();

    await page.locator("button", { hasText: "+ camada" }).click();

    await expect(page.locator(".layer")).toHaveCount(initialCount + 1);
  });

  test("renomeia camada via input", async ({ page }) => {
    const firstInput = page.locator(".layer input").first();
    await firstInput.waitFor();

    await firstInput.fill("Camada Renomeada");

    await expect(firstInput).toHaveValue("Camada Renomeada");
  });
});

// ─── 4. Timeline ──────────────────────────────────────────────────────────────

test.describe("Timeline", () => {
  test("cria frame e contador da timeline aumenta", async ({ page }) => {
    const initialCount = await page.locator(".timeline .frame").count();

    await page.locator("button", { hasText: "+ frame" }).click();

    await expect(page.locator(".timeline .frame")).toHaveCount(
      initialCount + 1,
    );
  });

  test("duplica frame e contador aumenta", async ({ page }) => {
    const initialCount = await page.locator(".timeline .frame").count();

    await page.locator("button", { hasText: "duplicar" }).click();

    await expect(page.locator(".timeline .frame")).toHaveCount(
      initialCount + 1,
    );
  });
});

// ─── 5. Preview de IA ─────────────────────────────────────────────────────────

test.describe("Preview de IA (provider local, sem IA externa)", () => {
  test("reject: preview aparece e desaparece sem alterar a revisão", async ({
    page,
  }) => {
    const revBefore = await getBridgeRevision(page);

    await page.locator("button", { hasText: "Gerar preview" }).click();
    await page.locator(".ai-preview").waitFor({ timeout: 15_000 });

    await page.locator("button", { hasText: "Rejeitar" }).click();
    await expect(page.locator(".ai-preview")).toBeHidden({ timeout: 5_000 });

    // Rejeitar não deve salvar projeto novo
    const revAfter = await getBridgeRevision(page);
    expect(revAfter).toBe(revBefore);
  });

  test("accept: preview desaparece após aceitar", async ({ page }) => {
    await page.locator("button", { hasText: "Gerar preview" }).click();
    await page.locator(".ai-preview").waitFor({ timeout: 15_000 });

    // Aguarda resposta do endpoint de accept (ou fallback local)
    const acceptDone = page.waitForResponse(
      (r) =>
        (r.url().includes("/api/ai-preview") ||
          r.url().includes("/api/project")) &&
        r.request().method() === "POST",
      { timeout: 10_000 },
    );

    await page.locator("button", { hasText: "Aceitar preview" }).click();

    const res = await acceptDone;
    expect(res.ok()).toBe(true);
    await expect(page.locator(".ai-preview")).toBeHidden({ timeout: 5_000 });
  });
});

// ─── 6. Exportação ────────────────────────────────────────────────────────────

test.describe("Exportação", () => {
  test("exibe relatório e bloqueia export quando o perfil exige QA sem erros", async ({ page }) => {
    await expect(page.locator("#export-qa-title")).toHaveText("QA antes do export");
    await expect(page.locator(".qa-summary")).toContainText("Frame vazio");

    await page.getByLabel("Política").selectOption("block");
    await page.locator("button", { hasText: "PNG frame" }).click();

    await expect(page.locator(".export-status.blocked")).toContainText("Export bloqueado pelo perfil");
  });

  test("exporta spritesheet PNG dispara download", async ({ page }) => {
    const download = page.waitForEvent("download", { timeout: 8_000 });

    await page.locator("button", { hasText: "Spritesheet" }).click();

    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/\.png$/i);
  });

  test("exporta PNG do frame ativo dispara download", async ({ page }) => {
    const download = page.waitForEvent("download", { timeout: 8_000 });

    await page.locator("button", { hasText: "PNG frame" }).click();

    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/\.png$/i);
  });
});

// ─── 7. Galeria ───────────────────────────────────────────────────────────────

test.describe("Galeria", () => {
  test("salva projeto na galeria e item aparece na listagem", async ({
    page,
  }) => {
    const galleryPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/gallery") && r.request().method() === "POST",
    );

    await page.locator("button", { hasText: "Salvar na galeria" }).click();
    const saveRes = await galleryPost;
    expect(saveRes.ok()).toBe(true);

    await page.locator("button", { hasText: "Listar galeria" }).click();
    await page.locator(".gallery button").first().waitFor({ timeout: 5_000 });

    const count = await page.locator(".gallery button").count();
    expect(count).toBeGreaterThan(0);
  });

  test("salva e recarrega item da galeria", async ({ page }) => {
    // Salva
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes("/api/gallery") && r.request().method() === "POST",
    );
    await page.locator("button", { hasText: "Salvar na galeria" }).click();
    await saved;

    // Lista
    await page.locator("button", { hasText: "Listar galeria" }).click();
    const item = page.locator(".gallery button").first();
    await item.waitFor({ timeout: 5_000 });

    // Carrega o item
    const loaded = page.waitForResponse(
      (r) =>
        r.url().includes("/api/gallery/") && r.request().method() === "GET",
      { timeout: 8_000 },
    );
    await item.click();
    const loadRes = await loaded;
    expect(loadRes.ok()).toBe(true);
  });
});
