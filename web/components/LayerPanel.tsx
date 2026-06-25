import { activeFrameOf } from "../../shared/pixel-core.ts";
import type { Frame, Layer, Project } from "../../shared/pixel-core.ts";

type LayerPanelProps = {
  frame: Frame;
  layerIndex: number;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  moveLayer: (index: number, direction: number) => void;
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
  updateLayer,
  updateProject,
  undo,
  redoAction,
}: LayerPanelProps) {
  return (
    <>
      <h2>Camadas</h2>
      <button onClick={addLayer}>+ camada</button>
      <button onClick={undo}>Undo</button>
      <button onClick={redoAction}>Redo</button>
      {frame.layers.map((layer, index) => (
        <div
          className={"layer " + (index === layerIndex ? "active" : "")}
          key={layer.id}
          onClick={() =>
            updateProject((draft) => {
              activeFrameOf(draft).activeLayerId = layer.id;
            }, false)
          }
        >
          <input
            value={layer.name}
            onChange={(event) =>
              updateLayer(index, (draft) => {
                draft.name = event.target.value;
              })
            }
          />
          <button
            onClick={(event) => {
              event.stopPropagation();
              updateLayer(index, (draft) => {
                draft.visible = !draft.visible;
              });
            }}
          >
            {layer.visible ? "👁" : "—"}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              moveLayer(index, -1);
            }}
          >
            ↑
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              moveLayer(index, 1);
            }}
          >
            ↓
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              removeLayer(layer.id);
            }}
          >
            x
          </button>
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
        </div>
      ))}
    </>
  );
}
