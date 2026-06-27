import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  activeFrameOf,
  activeLayerOf,
  compactProject,
  expandPixels,
  expandProject,
  indexOf,
  setPixel,
} from "../shared/pixel-core.ts";
import { ProjectRepository } from "../server/db.ts";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pixel-sqlite-"));
}

test("ProjectRepository migrates legacy JSON into SQLite", () => {
  const dir = tempDir();
  const legacyProjectPath = path.join(dir, "pixel-project.mcp.json");
  const legacyDbPath = path.join(dir, "pixel-art-db.json");
  const sqlitePath = path.join(dir, "editor.sqlite");
  const project = expandProject({ godot: { asset: "Legacy Hero" } });
  fs.writeFileSync(legacyProjectPath, JSON.stringify(compactProject(project)));
  fs.writeFileSync(
    legacyDbPath,
    JSON.stringify({
      users: [{ id: "u1", email: "a@b.test", name: "A" }],
      gallery: [{ id: "g1", name: "Gallery Hero", at: "2026-01-01T00:00:00.000Z", project }],
      history: [],
    }),
  );

  const repo = new ProjectRepository(sqlitePath, {
    legacyProjectPath,
    legacyDbPath,
  });
  try {
    assert.equal(repo.getProject().godot.asset, "Legacy Hero");
    assert.equal(repo.listGallery()[0].id, "g1");
    assert.equal(repo.upsertUser({ email: "a@b.test" }).id, "u1");
  } finally {
    repo.close();
  }
});

test("ProjectRepository saves active project with compact history", () => {
  const dir = tempDir();
  const repo = new ProjectRepository(path.join(dir, "editor.sqlite"));
  try {
    const project = repo.getProject();
    const layer = activeLayerOf(activeFrameOf(project));
    setPixel(layer, 3, 4, "#123456");
    const saved = repo.saveProject(project, {
      historyType: "setPixel",
      historyParams: { x: 3, y: 4, color: "#123456" },
      historySource: "test",
    });
    const reloaded = repo.getProject();
    const pixels = expandPixels(activeLayerOf(activeFrameOf(reloaded)).pixels);

    assert.equal(saved.revision, 1);
    assert.equal(pixels[indexOf(3, 4)], "#123456");
    assert.equal(repo.listHistory().length, 1);
    assert.equal(repo.listHistory()[0].patches[0].type, "pixels.changed");
  } finally {
    repo.close();
  }
});

test("ProjectRepository stores gallery project thumbnails separately", () => {
  const dir = tempDir();
  const repo = new ProjectRepository(path.join(dir, "editor.sqlite"));
  try {
    const item = repo.addGalleryProject({
      name: "Thumb",
      project: expandProject({ godot: { asset: "Thumb" } }),
      thumbnailBase64: "iVBORw0KGgo=",
    });
    const listed = repo.listGallery()[0];

    assert.equal(listed.id, item.id);
    assert.equal(listed.thumbnail, "iVBORw0KGgo=");
    assert.equal(repo.getGalleryProject(item.id)?.godot.asset, "Thumb");
  } finally {
    repo.close();
  }
});

test("ProjectRepository audits AI preview accept and reject outcomes", () => {
  const dir = tempDir();
  const repo = new ProjectRepository(path.join(dir, "editor.sqlite"));
  try {
    const at = "2026-06-27T12:00:00.000Z";
    repo.recordAiAudit({
      id: "accepted-preview",
      at,
      prompt: "crie uma espada",
      operation: "generate",
      provider: "fake-ai",
      providerKind: "external-ai",
      result: "preview_ready",
      warnings: [],
    });
    repo.recordAiAudit({
      id: "rejected-preview",
      at: "2026-06-27T12:00:01.000Z",
      prompt: "mude a cor",
      operation: "edit",
      provider: "local-heuristic",
      providerKind: "heuristic",
      result: "preview_ready",
      warnings: ["heuristic_provider_not_real_ai"],
    });

    assert.equal(repo.updateAiAudit("accepted-preview", "accepted"), true);
    assert.equal(repo.updateAiAudit("rejected-preview", "rejected"), true);
    const audit = repo.listAiAudits();
    assert.equal(
      audit.find((entry) => entry.id === "accepted-preview")?.result,
      "accepted",
    );
    assert.equal(
      audit.find((entry) => entry.id === "rejected-preview")?.result,
      "rejected",
    );
  } finally {
    repo.close();
  }
});
