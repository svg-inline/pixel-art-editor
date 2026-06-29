import { activeFrameOf } from "../../shared/pixel-core.ts";
import type { Frame, Layer, Project } from "../../shared/pixel-core.ts";

type LayerPanelProps = {
  frame: Frame;
  layerIndex: number;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  moveLayer: (index: number, direction: number) => void;
  mergeDown: (index: number) => void;
  updateLayer: (index: number, mutator: (layer: Layer) => void) => void;
  updateProject: (mutator: (project: Project) => Project | void, saveHist?: boolean) => void;
  undo: () => void;
  redoAction: () => void;
};

export function LayerPanel({
  frame,
  layerIndex,
  addLayer,
  removeLayer,
  moveLayer,
  mergeDown,
  updateLayer,
  updateProject,
  undo,
  redoAction,
}: LayerPanelProps) {
  return (
    <>
      <h2>Camadas</h2>
      <button type="button" onClick={addLayer}>+ camada</button>
      <button type="button" onClick={undo}>Undo</button>
      <button type="button" onClick={redoAction}>Redo</button>
      <button
        type="button"
        disabled={
          layerIndex <= 0 ||
          frame.layers[layerIndex]?.locked ||
          frame.layers[layerIndex - 1]?.locked
        }
        onClick={() => mergeDown(layerIndex)}
      >
        Mesclar abaixo
      </button>
      {frame.layers.map((layer, index) => (
        <div
          className={"layer " + (index === layerIndex ? "active" : "")}
          key={layer.id}
        >
          <button
            type="button"
            className="layer-select"
            aria-pressed={index === layerIndex}
            onClick={() =>
              updateProject((draft) => {
                activeFrameOf(draft).activeLayerId = layer.id;
              }, false)
            }
          >
            {index === layerIndex ? "Camada ativa" : "Ativar camada"}
          </button>
          <label className="visually-hidden" htmlFor={`layer-name-${layer.id}`}>
            Nome da camada
          </label>
          <input
            id={`layer-name-${layer.id}`}
            value={layer.name}
            onChange={(event) =>
              updateLayer(index, (draft) => {
                draft.name = event.target.value;
              })
            }
          />
          <button
            type="button"
            aria-label={`${layer.visible ? "Ocultar" : "Mostrar"} camada ${layer.name}`}
            aria-pressed={layer.visible}
            onClick={() => {
              updateLayer(index, (draft) => {
                draft.visible = !draft.visible;
              });
            }}
          >
            {layer.visible ? "👁" : "—"}
          </button>
          <button
            type="button"
            aria-label={`${layer.locked ? "Desbloquear" : "Bloquear"} camada ${layer.name}`}
            aria-pressed={layer.locked}
            onClick={() =>
              updateLayer(index, (draft) => {
                draft.locked = !draft.locked;
              })
            }
          >
            {layer.locked ? "🔒" : "🔓"}
          </button>
          <button
            type="button"
            aria-label={`${layer.alphaLocked ? "Desbloquear" : "Bloquear"} alfa da camada ${layer.name}`}
            aria-pressed={layer.alphaLocked}
            title="Lock alpha"
            onClick={() =>
              updateLayer(index, (draft) => {
                draft.alphaLocked = !draft.alphaLocked;
              })
            }
          >
            α{layer.alphaLocked ? "🔒" : ""}
          </button>
          <button
            type="button"
            aria-label={`Mover camada ${layer.name} para baixo na pilha`}
            disabled={index === 0}
            onClick={() => {
              moveLayer(index, -1);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Mover camada ${layer.name} para cima na pilha`}
            disabled={index === frame.layers.length - 1}
            onClick={() => {
              moveLayer(index, 1);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Excluir camada ${layer.name}`}
            disabled={frame.layers.length === 1 || layer.locked}
            onClick={() => {
              removeLayer(layer.id);
            }}
          >
            x
          </button>
          <label>
            Opacidade {Math.round(layer.opacity * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={layer.opacity}
              onChange={(event) =>
                updateLayer(index, (draft) => {
                  draft.opacity = +event.target.value;
                })
              }
            />
          </label>
        </div>
      ))}
    </>
  );
}
