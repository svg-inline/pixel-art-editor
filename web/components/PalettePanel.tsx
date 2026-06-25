import type { ChangeEvent } from "react";
import type { Project } from "../../shared/pixel-core.ts";
import type { qualityReport } from "../../shared/pixel-core.ts";

type PalettePanelProps = {
  project: Project;
  report: ReturnType<typeof qualityReport>;
  usedColors: [string, number][];
  maxColors: number;
  setMaxColors: (value: number) => void;
  replaceFrom: string;
  setReplaceFrom: (value: string) => void;
  replaceTo: string;
  setReplaceTo: (value: string) => void;
  limitColorsNow: () => void;
  replaceGlobalColor: () => void;
  exportPalette: () => void;
  importPalette: (event: ChangeEvent<HTMLInputElement>) => void;
  setColor: (value: string) => void;
};

export function PalettePanel({
  report,
  usedColors,
  maxColors,
  setMaxColors,
  replaceFrom,
  setReplaceFrom,
  replaceTo,
  setReplaceTo,
  limitColorsNow,
  replaceGlobalColor,
  exportPalette,
  importPalette,
  setColor,
}: PalettePanelProps) {
  return (
    <>
      <h2>Paleta / QA</h2>
      <label>
        Limite de cores{" "}
        <input
          type="number"
          min="2"
          max="256"
          value={maxColors}
          onChange={(event) => setMaxColors(+event.target.value)}
        />
      </label>
      <div
        className={
          report.overLimit ||
          report.falseCheckerboardPixels ||
          report.hasFullOpaqueLayer ||
          report.warnings.length
            ? "qa warn"
            : "qa ok"
        }
      >
        Cores: {report.colors}/{report.maxColors}
        <br />
        Frames: {report.frames}
        <br />
        Camadas: {report.layers}
        <br />
        Fundo:{" "}
        {report.background?.mode === "color"
          ? `cor ${report.background.color}`
          : "transparente"}
        <br />
        {report.bounds ? (
          <>
            Objeto: {report.bounds.w}x{report.bounds.h}
            <br />
            Centro: {report.bounds.centerOffsetX}, {report.bounds.centerOffsetY}
            <br />
          </>
        ) : (
          <>
            Objeto: vazio
            <br />
          </>
        )}
        Fundo opaco: {report.hasFullOpaqueLayer ? "sim" : "não"}
        <br />
        Quadriculado falso: {report.falseCheckerboardPixels}
        {report.warnings.length ? (
          <>
            <br />
            Avisos: {report.warnings.join(", ")}
          </>
        ) : null}
      </div>
      <button onClick={limitColorsNow}>limitar cores agora</button>
      <label>
        De{" "}
        <input
          type="color"
          value={replaceFrom}
          onChange={(event) => setReplaceFrom(event.target.value)}
        />
      </label>
      <label>
        Para{" "}
        <input
          type="color"
          value={replaceTo}
          onChange={(event) => setReplaceTo(event.target.value)}
        />
      </label>
      <button onClick={replaceGlobalColor}>substituir cor global</button>
      <button onClick={exportPalette}>exportar paleta</button>
      <input type="file" accept=".json,.gpl,.txt" onChange={importPalette} />
      <div className="used">
        {usedColors.slice(0, 48).map(([color, count]) => (
          <button
            key={color}
            style={{ background: color }}
            title={`${color} (${count})`}
            onClick={() => setColor(color)}
          />
        ))}
      </div>
    </>
  );
}
