import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { normalizeProject } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";
import { bridgeFetch } from "../lib/bridge.ts";
import { saveLocalProjectSnapshot } from "../lib/local-project.ts";
import { AUTOSAVE_DEBOUNCE_MS } from "../types.ts";
import type { AutosaveStatus, BridgeStatus } from "../types.ts";

type UseAutosaveParams = {
  project: Project;
  projectRef: MutableRefObject<Project>;
  setProject: (project: Project) => void;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  lastSavedSnapshotRef: MutableRefObject<string | null>;
  pendingSaveRevisionRef: MutableRefObject<number | null>;
  setAutosaveStatus: (status: AutosaveStatus) => void;
  setBridgeStatus: (status: BridgeStatus) => void;
  acceptSavedProject: (
    input: unknown,
    status?: AutosaveStatus,
  ) => Project;
};

export function useAutosave({
  project,
  projectRef,
  setProject,
  dirty,
  setDirty,
  lastSavedSnapshotRef,
  pendingSaveRevisionRef,
  setAutosaveStatus,
  setBridgeStatus,
  acceptSavedProject,
}: UseAutosaveParams) {
  useEffect(() => {
    const timeout = setTimeout(() => saveLocalProjectSnapshot(project), 600);
    return () => clearTimeout(timeout);
  }, [project]);

  useEffect(() => {
    const snapshot = JSON.stringify(project);
    if (lastSavedSnapshotRef.current === null)
      lastSavedSnapshotRef.current = snapshot;
    if (!dirty) return;
    if (snapshot === lastSavedSnapshotRef.current) {
      setDirty(false);
      setAutosaveStatus("saved");
      return;
    }
    setAutosaveStatus("dirty");
    const timeout = setTimeout(() => {
      void autosaveProject(project, snapshot);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [project, dirty]);

  async function autosaveProject(projectToSave: Project, snapshot: string) {
    const expectedRevision = projectToSave.revision;
    pendingSaveRevisionRef.current = expectedRevision;
    setAutosaveStatus("saving");
    try {
      const response = await bridgeFetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: projectToSave,
          revision: expectedRevision,
          source: "autosave",
          addHistory: false,
        }),
      });
      if (response.status === 409) {
        pendingSaveRevisionRef.current = null;
        setAutosaveStatus("conflict");
        setBridgeStatus("conflict");
        return;
      }
      if (!response.ok) throw new Error("autosave_failed");
      const saved = normalizeProject(await response.json());
      const currentSnapshot = JSON.stringify(projectRef.current);
      pendingSaveRevisionRef.current = null;
      if (currentSnapshot !== snapshot) {
        lastSavedSnapshotRef.current = JSON.stringify(saved);
        const current = normalizeProject({
          ...projectRef.current,
          revision: saved.revision,
        });
        projectRef.current = current;
        setProject(current);
        setAutosaveStatus("dirty");
        return;
      }
      acceptSavedProject(saved);
      setBridgeStatus("saved");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      pendingSaveRevisionRef.current = null;
      setAutosaveStatus("error");
      setBridgeStatus("offline");
    }
  }
}
