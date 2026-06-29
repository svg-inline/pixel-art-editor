import { useState } from "react";
import { SIZE } from "../../shared/pixel-core.ts";
import { EDITOR_SHORTCUTS } from "../hooks/useKeyboardShortcuts.ts";
import type { SymmetryMode } from "../types.ts";

type EditorProductivityPanelProps = {
  symmetry: SymmetryMode;
  setSymmetry: (mode: SymmetryMode) => void;
  resizeCanvasContent: (width: number, height: number) => void;
  cropCanvasToBounds: () => void;
};

export function EditorProductivityPanel({
  symmetry,
  setSymmetry,
  resizeCanvasContent,
  cropCanvasToBounds,
}: EditorProductivityPanelProps) {
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);

  return (
    <section aria-labelledby="productivity-title">
      <h2 id="productivity-title">Ferramentas profissionais</h2>
      <label>
        Simetria
        <select
          value={symmetry}
          onChange={(event) =>
            setSymmetry(event.target.value as SymmetryMode)
          }
        >
          <option value="none">desligada</option>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
          <option value="both">horizontal + vertical</option>
        </select>
      </label>

      <fieldset className="canvas-resize">
        <legend>Resize canvas</legend>
        <p id="resize-help" className="status">
          Redimensiona o conteúdo por nearest-neighbor e mantém o canvas de
          produção em {SIZE}×{SIZE}.
        </p>
        <div className="two-cols">
          <label>
            Largura
            <input
              type="number"
              min="1"
              max={SIZE}
              value={width}
              aria-describedby="resize-help"
              onChange={(event) => setWidth(+event.target.value)}
            />
          </label>
          <label>
            Altura
            <input
              type="number"
              min="1"
              max={SIZE}
              value={height}
              aria-describedby="resize-help"
              onChange={(event) => setHeight(+event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => resizeCanvasContent(width, height)}
        >
          Redimensionar conteúdo
        </button>
        <button type="button" onClick={cropCanvasToBounds}>
          Crop por bounds
        </button>
      </fieldset>

      <details className="shortcuts">
        <summary>Atalhos do editor</summary>
        <dl>
          {EDITOR_SHORTCUTS.map(([shortcut, action]) => (
            <div key={shortcut}>
              <dt>
                <kbd>{shortcut}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
