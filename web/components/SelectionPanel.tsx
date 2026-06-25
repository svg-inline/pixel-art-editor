type SelectionPanelProps = {
  copySelection: (cut?: boolean) => void;
  pasteSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
  transformSelection: (kind: "mirrorH" | "mirrorV" | "rotate90") => void;
  applyDitherToSelection: () => void;
};

export function SelectionPanel({
  copySelection,
  pasteSelection,
  moveSelection,
  transformSelection,
  applyDitherToSelection,
}: SelectionPanelProps) {
  return (
    <>
      <h2>Seleção</h2>
      <div className="grid-buttons">
        <button onClick={() => copySelection(false)}>copiar</button>
        <button onClick={() => copySelection(true)}>recortar</button>
        <button onClick={pasteSelection}>colar</button>
        <button onClick={() => moveSelection(-1, 0)}>←</button>
        <button onClick={() => moveSelection(1, 0)}>→</button>
        <button onClick={() => moveSelection(0, -1)}>↑</button>
        <button onClick={() => moveSelection(0, 1)}>↓</button>
        <button onClick={() => transformSelection("mirrorH")}>espelhar H</button>
        <button onClick={() => transformSelection("mirrorV")}>espelhar V</button>
        <button onClick={() => transformSelection("rotate90")}>
          rotacionar 90
        </button>
        <button onClick={applyDitherToSelection}>dithering</button>
      </div>
    </>
  );
}
