import type { RefObject } from "react";
import type {
  AiOperation,
  AiFlowState,
  AiPreviewState,
  BridgeStatus,
  GalleryItem,
} from "../types.ts";

type AiPanelProps = {
  bridgeStatus: BridgeStatus;
  autosaveLabel: string;
  dirty: boolean;
  renderStatsText: string;
  aiOperation: AiOperation;
  setAiOperation: (operation: AiOperation) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  applyPrompt: () => void;
  loadMcpPreviews: () => void;
  aiPreview: AiPreviewState | null;
  aiFlowState: AiFlowState;
  aiError: string | null;
  aiPreviewRef: RefObject<HTMLCanvasElement | null>;
  acceptAiPreview: () => void;
  rejectAiPreview: () => void;
  loadBackend: () => void;
  saveBackend: () => void;
  saveGallery: () => void;
  loadGalleryList: () => void;
  gallery: GalleryItem[];
  loadGalleryItem: (id: string) => void;
};

export function AiPanel({
  bridgeStatus,
  autosaveLabel,
  dirty,
  renderStatsText,
  aiOperation,
  setAiOperation,
  prompt,
  setPrompt,
  applyPrompt,
  loadMcpPreviews,
  aiPreview,
  aiFlowState,
  aiError,
  aiPreviewRef,
  acceptAiPreview,
  rejectAiPreview,
  loadBackend,
  saveBackend,
  saveGallery,
  loadGalleryList,
  gallery,
  loadGalleryItem,
}: AiPanelProps) {
  const busy =
    aiFlowState === "validating" || aiFlowState === "sending_to_provider";
  return (
    <>
      <h2>IA / MCP</h2>
      <div className="status">
        Bridge: <b>{bridgeStatus}</b>
        <br />
        Autosave: <b>{autosaveLabel}</b>
        {dirty ? " · alterações pendentes" : ""}
        <br />
        Render: <b>{renderStatsText}</b>
        <br />
        Pipeline IA: <b>{aiFlowState}</b>
        {aiError ? (
          <>
            <br />
            <span role="alert">{aiError}</span>
          </>
        ) : null}
      </div>
      <select
        value={aiOperation}
        onChange={(event) => setAiOperation(event.target.value as AiOperation)}
      >
        <option value="generate">gerar/substituir projeto</option>
        <option value="edit_selection">editar seleção</option>
        <option value="edit">editar canvas</option>
        <option value="create_variation">criar variação</option>
      </select>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
      />
      <button onClick={applyPrompt} disabled={busy}>
        {busy ? "Gerando preview…" : "Gerar preview"}
      </button>
      <button onClick={loadMcpPreviews}>Buscar previews MCP</button>
      {aiPreview ? (
        <div className="ai-preview">
          <canvas ref={aiPreviewRef} />
          <div className="status">
            Origem: <b>{aiPreview.source === "mcp" ? "MCP" : "IA"}</b>
            <br />
            Provider: <b>{aiPreview.provider}</b>
            {aiPreview.providerKind === "heuristic"
              ? " · heurístico local"
              : " · IA externa"}
            {aiPreview.model ? ` · ${aiPreview.model}` : ""}
            {aiPreview.summary ? (
              <>
                <br />
                Diff: {aiPreview.summary.operations} op ·{" "}
                {aiPreview.summary.pixelChanges} px
                {aiPreview.summary.structuralChanges
                  ? ` · ${aiPreview.summary.structuralChanges} estrut.`
                  : ""}
              </>
            ) : null}
            {aiPreview.fallback ? (
              <>
                <br />
                Fallback seguro após falha de {aiPreview.fallback.provider}: {" "}
                {aiPreview.fallback.code}
              </>
            ) : null}
            {aiPreview.warnings?.length ? (
              <>
                <br />
                Avisos: {aiPreview.warnings.join(" · ")}
              </>
            ) : null}
          </div>
          <button onClick={acceptAiPreview}>Aceitar preview</button>
          <button onClick={rejectAiPreview}>Rejeitar</button>
        </div>
      ) : null}
      <button onClick={loadBackend}>Importar do MCP/bridge</button>
      <button onClick={saveBackend}>Salvar no backend</button>
      <button onClick={saveGallery}>Salvar na galeria</button>
      <button onClick={loadGalleryList}>Listar galeria</button>
      <div className="gallery">
        {gallery.slice(0, 6).map((item) => (
          <button key={item.id} onClick={() => loadGalleryItem(item.id)}>
            {item.name} · {item.frames}f
          </button>
        ))}
      </div>
    </>
  );
}
