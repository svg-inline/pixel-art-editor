import type { Project, ProjectBackground } from "../../shared/pixel-core.ts";
import type { GridDensity, GridMode, Tool } from "../types.ts";
import { TOOL_NAMES } from "../types.ts";

type ToolPanelProps = {
  project: Project;
  color: string;
  setColor: (color: string) => void;
  tool: Tool;
  setTool: (tool: Tool) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  gridMode: GridMode;
  setGridMode: (mode: GridMode) => void;
  gridDensity: GridDensity;
  setGridDensity: (density: GridDensity) => void;
  gridStep: number;
  setGridStep: (step: number) => void;
  gridOpacity: number;
  setGridOpacity: (opacity: number) => void;
  gridMajorStep: number;
  setGridMajorStep: (step: number) => void;
  paintGridCell: boolean;
  setPaintGridCell: (paint: boolean) => void;
  effectiveGridStep: number;
  showOnion: boolean;
  setShowOnion: (show: boolean) => void;
  showNextOnion: boolean;
  setShowNextOnion: (show: boolean) => void;
  onionPrevOpacity: number;
  setOnionPrevOpacity: (opacity: number) => void;
  onionNextOpacity: number;
  setOnionNextOpacity: (opacity: number) => void;
  setBackgroundField: (
    key: keyof ProjectBackground,
    value: ProjectBackground[keyof ProjectBackground],
  ) => void;
};

export function ToolPanel({
  project,
  color,
  setColor,
  tool,
  setTool,
  zoom,
  setZoom,
  showGrid,
  setShowGrid,
  gridMode,
  setGridMode,
  gridDensity,
  setGridDensity,
  gridStep,
  setGridStep,
  gridOpacity,
  setGridOpacity,
  gridMajorStep,
  setGridMajorStep,
  paintGridCell,
  setPaintGridCell,
  effectiveGridStep,
  showOnion,
  setShowOnion,
  showNextOnion,
  setShowNextOnion,
  onionPrevOpacity,
  setOnionPrevOpacity,
  onionNextOpacity,
  setOnionNextOpacity,
  setBackgroundField,
}: ToolPanelProps) {
  return (
    <>
      <h1>Pixel ART 256</h1>
      <label>
        Cor{" "}
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <div className="palette">
        {project.palette.map((swatch) => (
          <button
            key={swatch}
            className="swatch"
            style={{ background: swatch }}
            title={swatch}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>
      <div className="tools">
        {TOOL_NAMES.map((toolName) => (
          <button
            key={toolName}
            className={tool === toolName ? "active" : ""}
            onClick={() => setTool(toolName)}
          >
            {toolName}
          </button>
        ))}
      </div>
      <label>
        Zoom{" "}
        <input
          type="range"
          min="1"
          max="8"
          value={zoom}
          onChange={(event) => setZoom(+event.target.value)}
        />{" "}
        {zoom}x
      </label>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(event) => setShowGrid(event.target.checked)}
        />{" "}
        grade
      </label>
      <div className="grid-settings">
        <label>
          Modo da grade{" "}
          <select
            value={gridMode}
            onChange={(event) => setGridMode(event.target.value as GridMode)}
            disabled={!showGrid}
          >
            <option value="auto">automático</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label>
          Densidade{" "}
          <select
            value={gridDensity}
            onChange={(event) =>
              setGridDensity(event.target.value as GridDensity)
            }
            disabled={!showGrid || gridMode !== "auto"}
          >
            <option value="compacta">compacta</option>
            <option value="normal">normal</option>
            <option value="limpa">limpa</option>
          </select>
        </label>
        <label>
          Passo{" "}
          <input
            type="range"
            min="1"
            max="32"
            value={gridMode === "auto" ? effectiveGridStep : gridStep}
            disabled={!showGrid || gridMode === "auto"}
            onChange={(event) => setGridStep(+event.target.value)}
          />{" "}
          {effectiveGridStep}px
        </label>
        <label>
          Opacidade{" "}
          <input
            type="range"
            min="0"
            max="45"
            value={gridOpacity}
            disabled={!showGrid}
            onChange={(event) => setGridOpacity(+event.target.value)}
          />{" "}
          {gridOpacity}%
        </label>
        <label>
          Linha forte{" "}
          <select
            value={gridMajorStep}
            disabled={!showGrid}
            onChange={(event) => setGridMajorStep(+event.target.value)}
          >
            <option value="0">desligada</option>
            <option value="8">8px</option>
            <option value="16">16px</option>
            <option value="32">32px</option>
            <option value="64">64px</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={paintGridCell}
            disabled={!showGrid}
            onChange={(event) => setPaintGridCell(event.target.checked)}
          />{" "}
          pintar célula da grade
        </label>
        <div className="status">
          Grade: {effectiveGridStep}px · tela: {effectiveGridStep * zoom}px
          {gridMode === "auto" ? ` · ${gridDensity}` : " · manual"}
        </div>
      </div>
      <label>
        <input
          type="checkbox"
          checked={showOnion}
          onChange={(event) => setShowOnion(event.target.checked)}
        />{" "}
        onion skin
      </label>
      <div className="grid-settings">
        <label>
          Anterior{" "}
          <input
            type="range"
            min="0"
            max="80"
            value={onionPrevOpacity}
            disabled={!showOnion}
            onChange={(event) => setOnionPrevOpacity(+event.target.value)}
          />{" "}
          {onionPrevOpacity}%
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showNextOnion}
            disabled={!showOnion}
            onChange={(event) => setShowNextOnion(event.target.checked)}
          />{" "}
          próximo frame
        </label>
        <label>
          Próximo{" "}
          <input
            type="range"
            min="0"
            max="80"
            value={onionNextOpacity}
            disabled={!showOnion || !showNextOnion}
            onChange={(event) => setOnionNextOpacity(+event.target.value)}
          />{" "}
          {onionNextOpacity}%
        </label>
      </div>

      <h2>Fundo</h2>
      <label>
        Tipo{" "}
        <select
          value={project.background.mode}
          onChange={(event) => setBackgroundField("mode", event.target.value)}
        >
          <option value="transparent">transparente / sem fundo</option>
          <option value="color">cor sólida</option>
        </select>
      </label>
      {project.background.mode === "color" ? (
        <label>
          Cor do fundo{" "}
          <input
            type="color"
            value={project.background.color}
            onChange={(event) =>
              setBackgroundField("color", event.target.value)
            }
          />
        </label>
      ) : null}
    </>
  );
}
