import type { MutableRefObject } from "react";
import {
  generatePixelArtFromPrompt,
  normalizeProject,
} from "../../shared/pixel-core.ts";
import type { Project, Selection } from "../../shared/pixel-core.ts";
import type { HistoryCommandName } from "../../shared/history.ts";
import { bridgeFetch } from "../lib/bridge.ts";
import type {
  AiOperation,
  AiFlowState,
  AiPreviewState,
  AutosaveStatus,
  BridgeStatus,
  GalleryItem,
  RemoteHistoryItem,
} from "../types.ts";

type UseBridgeActionsParams = {
  project: Project;
  projectRef: MutableRefObject<Project>;
  selection: Selection | null;
  prompt: string;
  aiOperation: AiOperation;
  aiPreview: AiPreviewState | null;
  setProject: (project: Project) => void;
  setAiPreview: (preview: AiPreviewState | null) => void;
  setAiFlowState: (state: AiFlowState) => void;
  setAiError: (error: string | null) => void;
  setGallery: (gallery: GalleryItem[]) => void;
  setRemoteHistory: (history: RemoteHistoryItem[]) => void;
  setAutosaveStatus: (status: AutosaveStatus) => void;
  setBridgeStatus: (status: BridgeStatus) => void;
  acceptSavedProject: (
    input: unknown,
    status?: AutosaveStatus,
  ) => Project;
  commitHistory: (
    before: Project | null,
    after: Project,
    type?: HistoryCommandName,
    params?: Record<string, unknown>,
  ) => void;
  markDirty: () => void;
  previewStateRef: MutableRefObject<AiPreviewState | null>;
};

export function useBridgeActions({
  project,
  projectRef,
  selection,
  prompt,
  aiOperation,
  aiPreview,
  setProject,
  setAiPreview,
  setAiFlowState,
  setAiError,
  setGallery,
  setRemoteHistory,
  setAutosaveStatus,
  setBridgeStatus,
  acceptSavedProject,
  commitHistory,
  markDirty,
  previewStateRef,
}: UseBridgeActionsParams) {
  async function saveBackend() {
    try {
      const response = await bridgeFetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          revision: project.revision,
          addHistory: true,
        }),
      });
      if (response.status === 409) {
        setAutosaveStatus("conflict");
        setBridgeStatus("conflict");
        return;
      }
      if (!response.ok) throw new Error("save_failed");
      acceptSavedProject(await response.json());
      setBridgeStatus("saved");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      setBridgeStatus("offline");
    }
  }

  async function loadBackend() {
    try {
      const response = await bridgeFetch("/api/project");
      if (response.ok) {
        const before = projectRef.current;
        const next = normalizeProject(await response.json());
        commitHistory(before, next, "project.replace", { source: "bridge" });
        acceptSavedProject(next);
        setBridgeStatus("loaded");
        setTimeout(() => setBridgeStatus("online"), 700);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }

  async function loadGalleryList() {
    try {
      const response = await bridgeFetch("/api/gallery");
      if (response.ok) setGallery(await response.json());
    } catch {
      setBridgeStatus("offline");
    }
  }

  async function loadRemoteHistory() {
    try {
      const response = await bridgeFetch("/api/history");
      if (response.ok) setRemoteHistory(await response.json());
    } catch {}
  }

  async function loadMcpPreviews() {
    try {
      if (previewStateRef.current?.source === "ai") return;
      const response = await bridgeFetch("/api/mcp-previews");
      if (!response.ok) return;
      const previews = await response.json();
      const first = Array.isArray(previews) ? previews[0] : null;
      if (!first) {
        if (previewStateRef.current?.source === "mcp") setAiPreview(null);
        return;
      }
      setAiPreview({
        id: first.id,
        project: normalizeProject(first.project),
        provider: first.source || "mcp",
        providerKind: "heuristic",
        prompt: first.command?.prompt || "",
        operation: "edit",
        source: "mcp",
        summary: first.summary,
      });
      setAiFlowState("preview_ready");
      setAiError(null);
      setBridgeStatus("prompt");
    } catch {}
  }

  async function saveGallery() {
    try {
      const response = await bridgeFetch("/api/gallery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: project.godot.asset, project }),
      });
      if (response.ok) {
        await loadGalleryList();
        setBridgeStatus("gallery-saved");
        setTimeout(() => setBridgeStatus("online"), 700);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }

  async function loadGalleryItem(id: string) {
    try {
      const response = await bridgeFetch(`/api/gallery/${id}`);
      if (response.ok) {
        const before = projectRef.current;
        const next = normalizeProject(await response.json());
        commitHistory(before, next, "project.replace", {
          source: "gallery",
          id,
        });
        acceptSavedProject(next);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }

  async function applyPrompt() {
    setAiFlowState("validating");
    setAiError(null);
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || normalizedPrompt.length > 2_000) {
      setAiFlowState("failed_with_recoverable_error");
      setAiError(
        normalizedPrompt ? "Prompt excede 2.000 caracteres." : "Informe um prompt.",
      );
      return;
    }
    setAiFlowState("sending_to_provider");
    let response: Response;
    try {
      response = await bridgeFetch("/api/ai-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: normalizedPrompt,
          operation: aiOperation,
          project,
          revision: project.revision,
          selection,
        }),
      });
    } catch {
      const next =
        aiOperation === "generate"
          ? generatePixelArtFromPrompt(normalizedPrompt, project)
          : project;
      setAiPreview({
        project: normalizeProject(next),
        provider: "local-heuristic/browser",
        providerKind: "heuristic",
        warnings: ["bridge_unavailable_browser_fallback"],
        prompt: normalizedPrompt,
        operation: aiOperation,
        source: "ai",
      });
      setAiFlowState("preview_ready");
      setBridgeStatus("local-prompt");
      return;
    }
    if (response.status === 409) {
      setAutosaveStatus("conflict");
      setBridgeStatus("conflict");
      setAiFlowState("failed_with_recoverable_error");
      setAiError("O projeto mudou durante a geração. Gere um novo preview.");
      return;
    }
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      setAiFlowState("failed_with_recoverable_error");
      setAiError(errorPayload.error || "O provider não conseguiu gerar o preview.");
      return;
    }
    const data = await response.json();
    setAiPreview({
      id: data.id,
      project: normalizeProject(data.project),
      provider: data.provider || "unknown",
      providerKind: data.providerKind || "external-ai",
      model: data.model,
      warnings: data.warnings,
      fallback: data.fallback,
      prompt: normalizedPrompt,
      operation: aiOperation,
      source: "ai",
      summary: data.summary,
    });
    setAiFlowState("preview_ready");
    setBridgeStatus(
      data.providerKind === "heuristic" ? "local-prompt" : "prompt",
    );
  }

  async function acceptAiPreview() {
    if (!aiPreview) return;
    const before = projectRef.current;
    if (aiPreview.id) {
      try {
        const acceptPath =
          aiPreview.source === "mcp"
            ? `/api/mcp-preview/${aiPreview.id}/accept`
            : `/api/ai-preview/${aiPreview.id}/accept`;
        const response = await bridgeFetch(acceptPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: project.revision }),
        });
        if (response.status === 409) {
          setAutosaveStatus("conflict");
          setBridgeStatus("conflict");
          return;
        }
        if (!response.ok) throw new Error("preview_accept_failed");
        const next = normalizeProject(await response.json());
        commitHistory(
          before,
          next,
          aiPreview.source === "mcp" ? "mcp.diff" : "project.change",
          {
            operation: aiPreview.operation,
            prompt: aiPreview.prompt,
            provider: aiPreview.provider,
            providerKind: aiPreview.providerKind,
          },
        );
        acceptSavedProject(next);
        setAiPreview(null);
        setAiFlowState("accepted");
        setAiError(null);
        void loadRemoteHistory();
        setBridgeStatus("saved");
        setTimeout(() => setBridgeStatus("online"), 700);
        return;
      } catch {
        setBridgeStatus("offline");
        setAiFlowState("failed_with_recoverable_error");
        setAiError("Não foi possível aceitar o preview.");
        return;
      }
    }
    const next = normalizeProject(aiPreview.project);
    commitHistory(before, next, "project.change", {
      operation: aiPreview.operation,
      prompt: aiPreview.prompt,
      provider: aiPreview.provider,
      providerKind: aiPreview.providerKind,
      fallback: true,
    });
    markDirty();
    projectRef.current = next;
    setProject(next);
    setAiPreview(null);
    setAiFlowState("accepted");
    setAiError(null);
    setBridgeStatus("local-prompt");
  }

  async function rejectAiPreview() {
    if (aiPreview?.id) {
      try {
        const rejectPath =
          aiPreview.source === "mcp"
            ? `/api/mcp-preview/${aiPreview.id}`
            : `/api/ai-preview/${aiPreview.id}`;
        await bridgeFetch(rejectPath, {
          method: "DELETE",
        });
      } catch {}
    }
    setAiPreview(null);
    setAiFlowState("rejected");
    setAiError(null);
    void loadRemoteHistory();
  }

  return {
    saveBackend,
    loadBackend,
    loadGalleryList,
    loadRemoteHistory,
    loadMcpPreviews,
    saveGallery,
    loadGalleryItem,
    applyPrompt,
    acceptAiPreview,
    rejectAiPreview,
  };
}
