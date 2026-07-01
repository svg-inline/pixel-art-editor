import { compactProject } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";
import {
  HISTORY_LIMIT,
  isHistoryCommand,
  type HistoryCommand,
} from "../../shared/history.ts";

const LOCAL_PROJECT_KEY = "pixel-project";
const LOCAL_HISTORY_KEY = "pixel-history-v1";
export const LOCAL_HISTORY_MAX_BYTES = 1_500_000;

export type LocalHistoryState = {
  history: HistoryCommand[];
  redo: HistoryCommand[];
};

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

export function loadLocalHistory(): LocalHistoryState {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return { history: [], redo: [] };
    const parsed = JSON.parse(raw);
    return {
      history: Array.isArray(parsed.history)
        ? parsed.history.filter(isHistoryCommand).slice(-HISTORY_LIMIT)
        : [],
      redo: Array.isArray(parsed.redo)
        ? parsed.redo.filter(isHistoryCommand).slice(0, HISTORY_LIMIT)
        : [],
    };
  } catch {
    try {
      localStorage.removeItem(LOCAL_HISTORY_KEY);
    } catch {}
    return { history: [], redo: [] };
  }
}

export function saveLocalHistory(input: LocalHistoryState) {
  const state: LocalHistoryState = {
    history: input.history.slice(-HISTORY_LIMIT),
    redo: input.redo.slice(0, HISTORY_LIMIT),
  };
  let serialized = JSON.stringify(state);
  while (
    new TextEncoder().encode(serialized).length > LOCAL_HISTORY_MAX_BYTES &&
    (state.history.length || state.redo.length)
  ) {
    if (state.history.length) state.history.shift();
    else state.redo.pop();
    serialized = JSON.stringify(state);
  }
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
