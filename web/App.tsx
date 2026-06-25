import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  activeAnimationOf,
  activeAssetOf,
  activeFrameOf,
  clamp,
  colorsUsed,
  qualityReport,
} from "../shared/pixel-core.ts";
import type { Selection } from "../shared/pixel-core.ts";
import { AiPanel } from "./components/AiPanel.tsx";
import { CanvasEditor } from "./components/CanvasEditor.tsx";
import { ExportPanel } from "./components/ExportPanel.tsx";
import { GameDataPanel } from "./components/GameDataPanel.tsx";
import { LayerPanel } from "./components/LayerPanel.tsx";
import { PalettePanel } from "./components/PalettePanel.tsx";
import { SelectionPanel } from "./components/SelectionPanel.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { ToolPanel } from "./components/ToolPanel.tsx";
import { useAutosave } from "./hooks/useAutosave.ts";
import { useBridge } from "./hooks/useBridge.ts";
import { useBridgeActions } from "./hooks/useBridgeActions.ts";
import { useCanvasInput } from "./hooks/useCanvasInput.ts";
import { useExportActions } from "./hooks/useExportActions.ts";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.ts";
import { useProject } from "./hooks/useProject.ts";
import { useProjectActions } from "./hooks/useProjectActions.ts";
import { useSelectionActions } from "./hooks/useSelectionActions.ts";
import {
  activeFrameIndex,
  activeLayerIndexOf,
  gridStepForZoom,
} from "./lib/editor-helpers.ts";
import type {
  AiOperation,
  AiPreviewState,
  Clip,
  GalleryItem,
  GridDensity,
  GridMode,
  RemoteHistoryItem,
  Tool,
} from "./types.ts";
import { AUTOSAVE_LABELS, DEFAULT_ZOOM } from "./types.ts";
import "./style.css";

function App() {
  const {
    project,
    setProject,
    projectRef,
    dirty,
    dirtyRef,
    setDirty,
    autosaveStatus,
    setAutosaveStatus,
    lastSavedSnapshotRef,
    pendingSaveRevisionRef,
    commitHistory,
    markDirty,
    acceptSavedProject,
    updateProject,
    undo,
    redoAction,
  } = useProject();

  const previewStateRef = useRef<AiPreviewState | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#111827");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showGrid, setShowGrid] = useState(true);
  const [gridMode, setGridMode] = useState<GridMode>("auto");
  const [gridDensity, setGridDensity] = useState<GridDensity>("normal");
  const [gridStep, setGridStep] = useState(1);
  const [gridOpacity, setGridOpacity] = useState(10);
  const [gridMajorStep, setGridMajorStep] = useState(32);
  const [paintGridCell, setPaintGridCell] = useState(true);
  const [showOnion, setShowOnion] = useState(true);
  const [showNextOnion, setShowNextOnion] = useState(true);
  const [onionPrevOpacity, setOnionPrevOpacity] = useState(25);
  const [onionNextOpacity, setOnionNextOpacity] = useState(18);
  const [showGameData, setShowGameData] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [prompt, setPrompt] = useState("crie personagem idle oeste");
  const [aiOperation, setAiOperation] = useState<AiOperation>("generate");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [remoteHistory, setRemoteHistory] = useState<RemoteHistoryItem[]>([]);
  const [maxColors, setMaxColors] = useState(32);
  const [replaceFrom, setReplaceFrom] = useState("#ffffff");
  const [replaceTo, setReplaceTo] = useState("#000000");
  const [previewFrame, setPreviewFrame] = useState(0);

  const { bridgeStatus, setBridgeStatus } = useBridge({
    projectRef,
    dirtyRef,
    pendingSaveRevisionRef,
    setAutosaveStatus,
    acceptSavedProject,
  });

  useAutosave({
    project,
    projectRef,
    setProject,
    dirty,
    setDirty,
    lastSavedSnapshotRef,
    pendingSaveRevisionRef,
    setAutosaveStatus,
    setBridgeStatus,
    acceptSavedProject,
  });

  const frame = activeFrameOf(project);
  const activeAsset = activeAssetOf(project);
  const activeAnimation = activeAnimationOf(project);
  const frameIndex = activeFrameIndex(project);
  const layerIndex = activeLayerIndexOf(frame);
  const report = useMemo(
    () => qualityReport(project, maxColors),
    [project, maxColors],
  );
  const usedColors = useMemo(() => colorsUsed(project), [project]);
  const effectiveGridStep = useMemo(
    () =>
      gridMode === "auto"
        ? gridStepForZoom(zoom, gridDensity)
        : clamp(Number(gridStep) || 1, 1, 64),
    [gridMode, gridDensity, gridStep, zoom],
  );
  const autosaveLabel = AUTOSAVE_LABELS[autosaveStatus];

  const projectActions = useProjectActions({ updateProject });
  const selectionActions = useSelectionActions({
    project,
    projectRef,
    frame,
    selection,
    setSelection,
    clipboard,
    setClipboard,
    color,
    replaceFrom,
    replaceTo,
    maxColors,
    updateProject,
    commitHistory,
    markDirty,
    setProject,
  });
  const exportActions = useExportActions({ project, frame, frameIndex });
  const bridgeActions = useBridgeActions({
    project,
    projectRef,
    selection,
    prompt,
    aiOperation,
    aiPreview,
    setProject,
    setAiPreview,
    setGallery,
    setRemoteHistory,
    setAutosaveStatus,
    setBridgeStatus,
    acceptSavedProject,
    commitHistory,
    markDirty,
    previewStateRef,
  });

  const {
    canvasRef,
    previewRef,
    aiPreviewRef,
    renderStatsText,
    checkerSize,
    canvasHandlers,
  } = useCanvasInput({
    project,
    projectRef,
    frame,
    frameIndex,
    previewFrame,
    aiPreview,
    tool,
    color,
    setColor,
    zoom,
    showGrid,
    showOnion,
    showNextOnion,
    onionPrevOpacity,
    onionNextOpacity,
    showGameData,
    gridOpacity,
    gridMajorStep,
    effectiveGridStep,
    paintGridCell,
    selection,
    setSelection,
    setProject,
    markDirty,
    commitHistory,
    updateProject,
  });

  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redoAction,
    setTool,
    setZoom,
  });

  useEffect(() => {
    const currentFrame = project.frames[previewFrame] || project.frames[0];
    const ms = clamp(
      Number(currentFrame?.duration || 1000 / Number(activeAnimation.fps || 6)),
      30,
      5000,
    );
    const timer = setTimeout(() => {
      setPreviewFrame((value) => {
        const last = Math.max(0, project.frames.length - 1);
        if (value >= last) return activeAnimation.loop ? 0 : last;
        return value + 1;
      });
    }, ms);
    return () => clearTimeout(timer);
  }, [
    activeAnimation.fps,
    activeAnimation.loop,
    project.frames,
    previewFrame,
  ]);

  useEffect(() => {
    setPreviewFrame((value) =>
      Math.min(value, Math.max(0, project.frames.length - 1)),
    );
  }, [project.activeAnimationId, project.frames.length]);

  useEffect(() => {
    previewStateRef.current = aiPreview;
  }, [aiPreview]);

  useEffect(() => {
    void bridgeActions.loadMcpPreviews();
    void bridgeActions.loadRemoteHistory();
    const timer = setInterval(() => {
      void bridgeActions.loadMcpPreviews();
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <main>
      <aside className="panel left">
        <ToolPanel
          project={project}
          color={color}
          setColor={setColor}
          tool={tool}
          setTool={setTool}
          zoom={zoom}
          setZoom={setZoom}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          gridMode={gridMode}
          setGridMode={setGridMode}
          gridDensity={gridDensity}
          setGridDensity={setGridDensity}
          gridStep={gridStep}
          setGridStep={setGridStep}
          gridOpacity={gridOpacity}
          setGridOpacity={setGridOpacity}
          gridMajorStep={gridMajorStep}
          setGridMajorStep={setGridMajorStep}
          paintGridCell={paintGridCell}
          setPaintGridCell={setPaintGridCell}
          effectiveGridStep={effectiveGridStep}
          showOnion={showOnion}
          setShowOnion={setShowOnion}
          showNextOnion={showNextOnion}
          setShowNextOnion={setShowNextOnion}
          onionPrevOpacity={onionPrevOpacity}
          setOnionPrevOpacity={setOnionPrevOpacity}
          onionNextOpacity={onionNextOpacity}
          setOnionNextOpacity={setOnionNextOpacity}
          setBackgroundField={projectActions.setBackgroundField}
        />

        <AiPanel
          bridgeStatus={bridgeStatus}
          autosaveLabel={autosaveLabel}
          dirty={dirty}
          renderStatsText={renderStatsText}
          aiOperation={aiOperation}
          setAiOperation={setAiOperation}
          prompt={prompt}
          setPrompt={setPrompt}
          applyPrompt={bridgeActions.applyPrompt}
          loadMcpPreviews={bridgeActions.loadMcpPreviews}
          aiPreview={aiPreview}
          aiPreviewRef={aiPreviewRef}
          acceptAiPreview={bridgeActions.acceptAiPreview}
          rejectAiPreview={bridgeActions.rejectAiPreview}
          remoteHistory={remoteHistory}
          loadRemoteHistory={bridgeActions.loadRemoteHistory}
          loadBackend={bridgeActions.loadBackend}
          saveBackend={bridgeActions.saveBackend}
          saveGallery={bridgeActions.saveGallery}
          loadGalleryList={bridgeActions.loadGalleryList}
          gallery={gallery}
          loadGalleryItem={bridgeActions.loadGalleryItem}
        />

        <ExportPanel
          project={project}
          activeAsset={activeAsset}
          activeAnimation={activeAnimation}
          setActiveAsset={projectActions.setActiveAsset}
          setActiveAnimation={projectActions.setActiveAnimation}
          addAnimation={projectActions.addAnimation}
          setGodotField={projectActions.setGodotField}
          exportPng={exportActions.exportPng}
          exportSpritesheet={exportActions.exportSpritesheet}
          exportGif={exportActions.exportGif}
          exportWebp={exportActions.exportWebp}
          exportZip={exportActions.exportZip}
          exportAsepriteJson={exportActions.exportAsepriteJson}
          exportTilemapJson={exportActions.exportTilemapJson}
          exportAtlasJson={exportActions.exportAtlasJson}
          exportGodotJson={exportActions.exportGodotJson}
          exportUnityJson={exportActions.exportUnityJson}
          saveJson={exportActions.saveJson}
          loadJson={selectionActions.loadJson}
        />
      </aside>

      <CanvasEditor
        canvasRef={canvasRef}
        checkerSize={checkerSize}
        {...canvasHandlers}
      />

      <aside className="panel right">
        <Timeline
          project={project}
          previewRef={previewRef}
          previewFrame={previewFrame}
          activeAnimation={activeAnimation}
          addFrame={projectActions.addFrame}
          duplicateFrame={projectActions.duplicateFrame}
          moveFrame={projectActions.moveFrame}
          removeFrame={projectActions.removeFrame}
          updateProject={updateProject}
        />

        <GameDataPanel
          frame={frame}
          showGameData={showGameData}
          setShowGameData={setShowGameData}
          updateActiveFrame={projectActions.updateActiveFrame}
          addFrameBox={projectActions.addFrameBox}
        />

        <SelectionPanel
          copySelection={selectionActions.copySelection}
          pasteSelection={selectionActions.pasteSelection}
          moveSelection={selectionActions.moveSelection}
          transformSelection={selectionActions.transformSelection}
          applyDitherToSelection={selectionActions.applyDitherToSelection}
        />

        <PalettePanel
          project={project}
          report={report}
          usedColors={usedColors}
          maxColors={maxColors}
          setMaxColors={setMaxColors}
          replaceFrom={replaceFrom}
          setReplaceFrom={setReplaceFrom}
          replaceTo={replaceTo}
          setReplaceTo={setReplaceTo}
          limitColorsNow={selectionActions.limitColorsNow}
          replaceGlobalColor={selectionActions.replaceGlobalColor}
          exportPalette={selectionActions.exportPalette}
          importPalette={selectionActions.importPalette}
          setColor={setColor}
        />

        <LayerPanel
          frame={frame}
          layerIndex={layerIndex}
          addLayer={projectActions.addLayer}
          removeLayer={projectActions.removeLayer}
          moveLayer={projectActions.moveLayer}
          updateLayer={projectActions.updateLayer}
          updateProject={updateProject}
          undo={undo}
          redoAction={redoAction}
        />
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
