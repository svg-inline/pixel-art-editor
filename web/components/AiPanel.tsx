import type { RefObject } from "react";
import type {
  AiOperation,
  AiPreviewState,
  BridgeStatus,
  GalleryItem,
  RemoteHistoryItem,
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
  aiPreviewRef: RefObject<HTMLCanvasElement | null>;
  acceptAiPreview: () => void;
  rejectAiPreview: () => void;
  remoteHistory: RemoteHistoryItem[];
  loadRemoteHistory: () => void;
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
  aiPreviewRef,
  acceptAiPreview,
  rejectAiPreview,
  remoteHistory,
  loadRemoteHistory,
  loadBackend,
  saveBackend,
  saveGallery,
  loadGalleryList,
  gallery,
  loadGalleryItem,
}: AiPanelProps) {
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
      <button onClick={applyPrompt}>Gerar preview</button>
      <button onClick={loadMcpPreviews}>Buscar previews MCP</button>
      {aiPreview ? (
        <div className="ai-preview">
          <canvas ref={aiPreviewRef} />
          <div className="status">
            Origem: <b>{aiPreview.source === "mcp" ? "MCP" : "IA"}</b>
            <br />
            Provider: <b>{aiPreview.provider}</b>
            {aiPreview.providerKind === "local"
              ? " · heurístico local"
              : " · externo"}
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
          </div>
          <button onClick={acceptAiPreview}>Aceitar preview</button>
          <button onClick={rejectAiPreview}>Rejeitar</button>
        </div>
      ) : null}
      <div className="history-list">
        <div className="status">
          Histórico remoto <button onClick={loadRemoteHistory}>atualizar</button>
        </div>
        {remoteHistory.slice(0, 5).map((item) => (
          <div key={item.id} className="history-item">
            <b>{item.tool || item.command}</b>
            <span>{new Date(item.timestamp || item.at).toLocaleString()}</span>
            {item.prompt ? <em>{item.prompt}</em> : null}
            <small>
              {item.source || "bridge"} · {item.patches} patch(es) ·{" "}
              {item.pixelChanges} px
            </small>
          </div>
        ))}
      </div>
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
