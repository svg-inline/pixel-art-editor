import { useEffect, useMemo, useRef, useState } from "react";
import { activeFrameOf, type Project } from "../../shared/pixel-core.ts";
import {
  applyCommand,
  historyLabel,
  revertCommand,
  summarizeHistoryPrompt,
  type HistoryCommand,
} from "../../shared/history.ts";
import { renderFrameFresh } from "../canvas-renderer.ts";
import type { RemoteHistoryItem } from "../types.ts";

type HistoryPanelProps = {
  project: Project;
  history: HistoryCommand[];
  redo: HistoryCommand[];
  undo: () => void;
  redoAction: () => void;
  remoteHistory: RemoteHistoryItem[];
  loadRemoteHistory: () => void;
};

type Preview = { mode: "undo" | "redo"; command: HistoryCommand };

function commandDetails(command: HistoryCommand) {
  const pixels = command.patches.reduce(
    (total, patch) =>
      patch.type === "pixels.changed" ? total + patch.changes.length : total,
    0,
  );
  const structural = command.patches.filter(
    (patch) => patch.type !== "pixels.changed",
  ).length;
  return `${command.patches.length} patch(es) · ${pixels} px${
    structural > 0 ? ` · ${structural} estrut.` : ""
  }`;
}

function commandPrompt(command: HistoryCommand) {
  return summarizeHistoryPrompt(
    command.command.params?.promptSummary || command.command.params?.prompt,
  );
}

export function HistoryPanel({
  project,
  history,
  redo,
  undo,
  redoAction,
  remoteHistory,
  loadRemoteHistory,
}: HistoryPanelProps) {
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const nextUndo = history.at(-1);
  const nextRedo = redo[0];
  const previewProject = useMemo(() => {
    if (!preview) return null;
    return preview.mode === "undo"
      ? revertCommand(project, preview.command)
      : applyCommand(project, preview.command);
  }, [preview, project]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !previewProject) return;
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      renderFrameFresh(activeFrameOf(previewProject), previewProject.background),
      0,
      0,
    );
  }, [previewProject]);

  function executePreview() {
    if (!preview) return;
    if (preview.mode === "undo") undo();
    else redoAction();
    setPreview(null);
  }

  return (
    <section className="history-panel" aria-labelledby="history-title">
      <h2 id="history-title">Histórico</h2>
      <div className="history-actions">
        <button
          type="button"
          disabled={!nextUndo}
          title={nextUndo ? `Desfazer: ${nextUndo.command.label}` : "Nada para desfazer"}
          onClick={() => nextUndo && setPreview({ mode: "undo", command: nextUndo })}
        >
          Desfazer…
        </button>
        <button
          type="button"
          disabled={!nextRedo}
          title={nextRedo ? `Refazer: ${nextRedo.command.label}` : "Nada para refazer"}
          onClick={() => nextRedo && setPreview({ mode: "redo", command: nextRedo })}
        >
          Refazer…
        </button>
      </div>

      {preview && previewProject ? (
        <div className="history-preview" role="group" aria-label="Preview da alteração">
          <canvas ref={previewRef} aria-label="Resultado previsto da alteração" />
          <div>
            <b>
              {preview.mode === "undo" ? "Desfazer" : "Refazer"}: {" "}
              {preview.command.command.label || historyLabel(preview.command.command.type)}
            </b>
            <small>{commandDetails(preview.command)}</small>
            {commandPrompt(preview.command) ? (
              <em>“{commandPrompt(preview.command)}”</em>
            ) : null}
            <div>
              <button type="button" onClick={executePreview}>
                Confirmar {preview.mode === "undo" ? "desfazer" : "refazer"}
              </button>
              <button type="button" onClick={() => setPreview(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="history-list" aria-label="Ações desta sessão">
        <div className="status">Sessão · limite de 100 ações</div>
        {[...history].reverse().slice(0, 12).map((item, index) => (
          <div key={item.id} className="history-item">
            <b>{item.command.label || historyLabel(item.command.type)}</b>
            <span>{index === 0 ? "Próxima a desfazer · " : ""}{new Date(item.at).toLocaleTimeString()}</span>
            {commandPrompt(item) ? <em>“{commandPrompt(item)}”</em> : null}
            <small>
              {item.command.source || "web"} · {commandDetails(item)}
              {item.command.params?.provider
                ? ` · ${String(item.command.params.provider)}`
                : ""}
            </small>
          </div>
        ))}
        {redo.map((item, index) => (
          <div key={`redo:${item.id}`} className="history-item history-item-redo">
            <b>{item.command.label || historyLabel(item.command.type)}</b>
            <span>{index === 0 ? "Próxima a refazer" : "Fila de refazer"}</span>
            <small>{commandDetails(item)}</small>
          </div>
        ))}
        {!history.length && !redo.length ? (
          <div className="status">Nenhuma alteração nesta sessão.</div>
        ) : null}
      </div>

      <details className="remote-history">
        <summary>Histórico persistido</summary>
        <button type="button" onClick={loadRemoteHistory}>Atualizar</button>
        {remoteHistory.slice(0, 8).map((item) => (
          <div key={item.id} className="history-item">
            <b>{item.label || item.tool || item.command}</b>
            <span>{new Date(item.timestamp || item.at).toLocaleString()}</span>
            {item.prompt ? <em>“{summarizeHistoryPrompt(item.prompt)}”</em> : null}
            <small>
              {item.source || "bridge"} · {item.patches} patch(es) · {item.pixelChanges} px
              {item.result ? ` · ${item.result}` : ""}
              {item.provider ? ` · ${item.provider}` : ""}
            </small>
          </div>
        ))}
      </details>
    </section>
  );
}
