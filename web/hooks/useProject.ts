import { useEffect, useRef, useState } from "react";
import { normalizeProject } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";
import {
  applyCommand,
  createProjectCommand,
  revertCommand,
  type HistoryCommand,
  HISTORY_LIMIT,
  type HistoryCommandName,
} from "../../shared/history.ts";
import { cloneProject } from "../lib/editor-helpers.ts";
import {
  loadLocalHistory,
  loadLocalProjectSnapshot,
  saveLocalHistory,
} from "../lib/local-project.ts";
import type { AutosaveStatus } from "../types.ts";

export function useProject() {
  const initialHistoryRef = useRef<ReturnType<typeof loadLocalHistory> | null>(null);
  if (!initialHistoryRef.current) initialHistoryRef.current = loadLocalHistory();
  const [project, setProject] = useState<Project>(() =>
    normalizeProject(loadLocalProjectSnapshot()),
  );
  const projectRef = useRef<Project>(project);
  const dirtyRef = useRef(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const pendingSaveRevisionRef = useRef<number | null>(null);
  const [history, setHistory] = useState<HistoryCommand[]>(
    () => initialHistoryRef.current?.history || [],
  );
  const [redo, setRedo] = useState<HistoryCommand[]>(
    () => initialHistoryRef.current?.redo || [],
  );
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>("idle");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const timeout = setTimeout(() => saveLocalHistory({ history, redo }), 250);
    return () => clearTimeout(timeout);
  }, [history, redo]);

  function pushHistory(command: HistoryCommand | null) {
    if (!command) return;
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), command]);
    setRedo([]);
  }

  function commitHistory(
    before: Project | null,
    after: Project,
    type: HistoryCommandName = "project.change",
    params?: Record<string, unknown>,
  ) {
    if (!before) return;
    pushHistory(createProjectCommand(before, after, type, params, "web"));
  }

  function markDirty() {
    setDirty(true);
    setAutosaveStatus("dirty");
  }

  function acceptSavedProject(
    input: unknown,
    status: AutosaveStatus = "saved",
  ) {
    const next = normalizeProject(input);
    lastSavedSnapshotRef.current = JSON.stringify(next);
    pendingSaveRevisionRef.current = null;
    setDirty(false);
    setAutosaveStatus(status);
    projectRef.current = next;
    setProject(next);
    return next;
  }

  function updateProject(
    mutator: (project: Project) => Project | void,
    saveHist = true,
    historyType: HistoryCommandName = "project.change",
    params?: Record<string, unknown>,
  ) {
    markDirty();
    const before = cloneProject(projectRef.current);
    // `frames` é a visão da animação ativa. Um clone estrutural separa
    // essas duas referências e faz `normalizeProject` descartar mutações feitas
    // em `draft.frames`. Normalizar a origem recria o vínculo antes da edição.
    const draft = normalizeProject(projectRef.current);
    const next = normalizeProject(mutator(draft) || draft);
    if (saveHist) commitHistory(before, next, historyType, params);
    projectRef.current = next;
    setProject(next);
  }

  function undo() {
    if (!history.length) return;
    markDirty();
    const command = history[history.length - 1];
    setRedo((items) => [command, ...items]);
    const next = revertCommand(projectRef.current, command);
    projectRef.current = next;
    setProject(next);
    setHistory((items) => items.slice(0, -1));
  }

  function redoAction() {
    if (!redo.length) return;
    markDirty();
    const command = redo[0];
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), command]);
    const next = applyCommand(projectRef.current, command);
    projectRef.current = next;
    setProject(next);
    setRedo((items) => items.slice(1));
  }

  return {
    project,
    setProject,
    projectRef,
    dirty,
    dirtyRef,
    setDirty,
    history,
    redo,
    autosaveStatus,
    setAutosaveStatus,
    lastSavedSnapshotRef,
    pendingSaveRevisionRef,
    pushHistory,
    commitHistory,
    markDirty,
    acceptSavedProject,
    updateProject,
    undo,
    redoAction,
  };
}
