import { compactProject } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";

const LOCAL_PROJECT_KEY = "pixel-project";

export function loadLocalProjectSnapshot() {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    try {
      localStorage.removeItem(LOCAL_PROJECT_KEY);
    } catch {}
    return null;
  }
}

export function saveLocalProjectSnapshot(project: Project) {
  try {
    localStorage.setItem(
      LOCAL_PROJECT_KEY,
      JSON.stringify(compactProject(project)),
    );
    return true;
  } catch (error) {
    try {
      localStorage.removeItem(LOCAL_PROJECT_KEY);
    } catch {}
    console.warn(
      "Projeto grande demais para localStorage; usando bridge/runtime.",
      error,
    );
    return false;
  }
}
