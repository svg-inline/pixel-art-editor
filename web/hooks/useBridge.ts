import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { normalizeProject } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";
import { bridgeUrl } from "../lib/bridge.ts";
import type { AutosaveStatus, BridgeStatus } from "../types.ts";

type UseBridgeParams = {
  projectRef: MutableRefObject<Project>;
  dirtyRef: MutableRefObject<boolean>;
  pendingSaveRevisionRef: MutableRefObject<number | null>;
  setAutosaveStatus: (status: AutosaveStatus) => void;
  acceptSavedProject: (
    input: unknown,
    status?: AutosaveStatus,
  ) => Project;
};

export function useBridge({
  projectRef,
  dirtyRef,
  pendingSaveRevisionRef,
  setAutosaveStatus,
  acceptSavedProject,
}: UseBridgeParams) {
  const [bridgeStatus, setBridgeStatus] =
    useState<BridgeStatus>("offline");

  useEffect(() => {
    let events: EventSource | undefined;
    try {
      events = new EventSource(bridgeUrl("/api/events", true));
      events.onopen = () => setBridgeStatus("online");
      events.onerror = () => setBridgeStatus("offline");
      events.addEventListener("project", (event) => {
        try {
          const data = normalizeProject(JSON.parse(event.data));
          const localRevision = projectRef.current.revision;
          if (dirtyRef.current) {
            const ownPendingSave =
              pendingSaveRevisionRef.current === localRevision;
            if (data.revision > localRevision && !ownPendingSave) {
              setAutosaveStatus("conflict");
              setBridgeStatus("conflict");
            }
            return;
          }
          acceptSavedProject(data, "saved");
          setBridgeStatus("sync");
          setTimeout(() => setBridgeStatus("online"), 700);
        } catch {
          setBridgeStatus("erro");
        }
      });
    } catch {
      setBridgeStatus("offline");
    }
    return () => events?.close?.();
  }, []);

  return { bridgeStatus, setBridgeStatus };
}
