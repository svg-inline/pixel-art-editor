import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  activeFrameOf,
  activeAnimationOf,
  activeAssetOf,
  activeLayerOf,
  atlasMetadata,
  blankFrame,
  blankLayer,
  clamp,
  clone,
  colorsUsed,
  compactProject,
  DIRECTIONS,
  drawEllipse,
  drawLine,
  drawRect,
  expandPixels,
  generatePixelArtFromPrompt,
  godotMetadata,
  indexOf,
  isHex,
  limitColors as limitProjectColors,
  normalizeProject,
  qualityReport,
  replaceGlobalColor as replaceProjectColor,
  rotate90Selection,
  syncActiveAnimationMeta,
  selectionBounds,
  SIZE,
  slug,
  uid,
  unityMetadata,
} from "../shared/pixel-core.ts";
import type {
  Frame,
  Layer,
  Pixel,
  PixelArray,
  PixelSelectionClip,
  Project,
  ProjectBackground,
  Selection,
} from "../shared/pixel-core.ts";
import {
  applyCommand,
  createProjectCommand,
  revertCommand,
  type HistoryCommand,
  type HistoryCommandName,
} from "../shared/history.ts";
import {
  renderFrameCached,
  renderFrameFresh,
  renderCacheStats,
} from "./canvas-renderer.ts";
import "./style.css";

type Tool =
  | "pencil"
  | "eraser"
  | "bucket"
  | "picker"
  | "select"
  | "dither"
  | "line"
  | "rect"
  | "ellipse";
type AiOperation = "generate" | "edit_selection" | "edit" | "create_variation";
type GridMode = "auto" | "manual";
type GridDensity = "compacta" | "normal" | "limpa";
type BridgeStatus =
  | "offline"
  | "online"
  | "sync"
  | "erro"
  | "saved"
  | "loaded"
  | "gallery-saved"
  | "prompt"
  | "local-prompt"
  | "conflict";
type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";
type Point = Pick<Selection, "x" | "y">;
type Clip = PixelSelectionClip;
type GalleryItem = {
  id: string;
  name: string;
  frames: number;
};
type AiPreviewState = {
  id?: string;
  project: Project;
  provider: string;
  providerKind: "local" | "http";
  model?: string;
  prompt: string;
  operation: AiOperation;
  source?: "ai" | "mcp";
  summary?: {
    operations: number;
    pixelChanges: number;
    structuralChanges: number;
    replacesProject: boolean;
    colorsAfter: number;
  };
};
type RemoteHistoryItem = {
  id: string;
  at: string;
  command: string;
  label?: string;
  source?: string;
  tool?: string;
  prompt?: string;
  timestamp?: string;
  patches: number;
  pixelChanges: number;
  params?: Record<string, unknown>;
};
type BoxKind = "hitbox" | "hurtbox" | "attackbox";
type ShapeTool = Extract<Tool, "line" | "rect" | "ellipse">;
type ShapePreviewState = {
  tool: ShapeTool;
  start: Point;
  end: Point;
};

const DEFAULT_ZOOM = 3;
const AUTOSAVE_DEBOUNCE_MS = 900;
const BRIDGE_URL =
  import.meta.env.VITE_PIXEL_BRIDGE_URL || "http://localhost:8787";
const BRIDGE_TOKEN = import.meta.env.VITE_PIXEL_BRIDGE_TOKEN || "";
const LOCAL_PROJECT_KEY = "pixel-project";
const DEFAULT_ANIMS = ["idle", "walk", "attack", "dodge", "skill", "death"];
const idx = indexOf;
const GRID_DENSITY_TARGETS = {
  compacta: 14,
  normal: 26,
  limpa: 42,
};
const GRID_STEPS = [1, 2, 4, 8, 16, 32, 64];
const gridStepForZoom = (zoom: number, density: GridDensity = "normal") => {
  const target = GRID_DENSITY_TARGETS[density] || GRID_DENSITY_TARGETS.normal;
  return GRID_STEPS.find((step) => step * zoom >= target) || 64;
};
function bridgeUrl(path: string, includeToken = false) {
  const url = new URL(path, BRIDGE_URL);
  if (includeToken && BRIDGE_TOKEN) url.searchParams.set("token", BRIDGE_TOKEN);
  return url.toString();
}
function bridgeHeaders(headers?: HeadersInit) {
  const out = new Headers(headers);
  if (BRIDGE_TOKEN) out.set("x-pixel-token", BRIDGE_TOKEN);
  return out;
}
function bridgeFetch(path: string, init: RequestInit = {}) {
  return fetch(bridgeUrl(path), {
    ...init,
    headers: bridgeHeaders(init.headers),
  });
}
function loadLocalProjectSnapshot() {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    try {
      localStorage.removeItem(LOCAL_PROJECT_KEY);
    } catch {}
    return null;
  }
}
function saveLocalProjectSnapshot(project: Project) {
  try {
    localStorage.setItem(
      LOCAL_PROJECT_KEY,
      JSON.stringify(compactProject(project)),
    );
    return true;
  } catch (error) {
    try {
      localStorage.removeItem(LOCAL_PROJECT_KEY);
    } catch {}
    console.warn("Projeto grande demais para localStorage; usando bridge/runtime.", error);
    return false;
  }
}

function cloneProject<T>(p: T): T {
  return clone(p);
}
function activeFrameIndex(project: Project) {
  return Math.max(
    0,
    project.frames.findIndex((f) => f.id === project.activeFrameId),
  );
}
function activeLayerIndexOf(frame: Frame) {
  return Math.max(
    0,
    frame.layers.findIndex((l) => l.id === frame.activeLayerId),
  );
}
function floodFillFrame(
  frame: Frame,
  layerIndex: number,
  x: number,
  y: number,
  color: Pixel,
) {
  const layer = frame.layers[layerIndex];
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  const target = pixels[idx(x, y)];
  if (target === color) return;
  const q = [[x, y]];
  const visited = new Uint8Array(SIZE * SIZE);
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
    const i = idx(cx, cy);
    if (visited[i]) continue;
    visited[i] = 1;
    if (pixels[i] !== target) continue;
    pixels[i] = color;
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function fillBackground(
  ctx: CanvasRenderingContext2D,
  background: ProjectBackground,
  scale = 1,
) {
  if (background?.mode !== "color") return;
  ctx.fillStyle = isHex(background.color) ? background.color : "#0f172a";
  ctx.fillRect(0, 0, SIZE * scale, SIZE * scale);
}
function downloadText(filename: string, text: string, type = "application/json") {
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function downloadCanvas(filename: string, canvas: HTMLCanvasElement) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => JSON.parse(t));
}
function getSelectionPixels(layer: Layer, sel: Selection | null): Clip | null {
  const b = selectionBounds(sel);
  if (!b) return null;
  const layerPixels = expandPixels(layer.pixels);
  const pixels: PixelArray = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      pixels.push(layerPixels[idx(b.x + x, b.y + y)]);
  return { ...b, pixels };
}
function pastePixels(
  layer: Layer,
  clip: Clip | null,
  targetX: number,
  targetY: number,
  eraseSource = false,
) {
  if (!clip) return;
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  if (eraseSource) {
    for (let y = 0; y < clip.h; y++)
      for (let x = 0; x < clip.w; x++) {
        const sx = clip.x + x,
          sy = clip.y + y;
        if (sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE)
          pixels[idx(sx, sy)] = null;
      }
  }
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const tx = targetX + x,
        ty = targetY + y;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
        pixels[idx(tx, ty)] = clip.pixels[y * clip.w + x];
    }
}
function eraseClipPixels(layer: Layer, clip: Clip) {
  const pixels = expandPixels(layer.pixels);
  layer.pixels = pixels;
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const tx = clip.x + x,
        ty = clip.y + y;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
        pixels[idx(tx, ty)] = null;
    }
}
function FrameThumbnail({
  frame,
  background,
}: {
  frame: Frame;
  background: ProjectBackground;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(renderFrameFresh(frame, background), 0, 0, 48, 48);
  }, [frame, background]);
  return <canvas className="frame-thumb" ref={ref} />;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const aiPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const previewStateRef = useRef<AiPreviewState | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const strokeBeforeRef = useRef<Project | null>(null);
  const shapeStartRef = useRef<Point | null>(null);
  const lastCellRef = useRef<Point | null>(null);
  const lastBridgeSave = useRef(0);
  const lastRenderStatsUpdateRef = useRef(0);
  const [project, setProject] = useState<Project>(() =>
    normalizeProject(loadLocalProjectSnapshot()),
  );
  const projectRef = useRef<Project>(project);
  const dirtyRef = useRef(false);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const pendingSaveRevisionRef = useRef<number | null>(null);
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
  const [history, setHistory] = useState<HistoryCommand[]>([]);
  const [redo, setRedo] = useState<HistoryCommand[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [shapePreview, setShapePreview] = useState<ShapePreviewState | null>(
    null,
  );
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [prompt, setPrompt] = useState("crie personagem idle oeste");
  const [aiOperation, setAiOperation] = useState<AiOperation>("generate");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("offline");
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [remoteHistory, setRemoteHistory] = useState<RemoteHistoryItem[]>([]);
  const [maxColors, setMaxColors] = useState(32);
  const [replaceFrom, setReplaceFrom] = useState("#ffffff");
  const [replaceTo, setReplaceTo] = useState("#000000");
  const [previewFrame, setPreviewFrame] = useState(0);
  const [renderStatsText, setRenderStatsText] = useState("cache frio");
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
  const checkerSize = Math.max(8, Math.min(32, zoom * 4));
  const autosaveLabel = {
    idle: "aguardando",
    dirty: "pendente",
    saving: "salvando",
    saved: "salvo",
    error: "erro",
    conflict: "conflito",
  }[autosaveStatus];

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    scheduleCanvasRender();
  }, [
    project,
    zoom,
    showGrid,
    showOnion,
    selection,
    shapePreview,
    gridMode,
    gridDensity,
    gridStep,
    gridOpacity,
    gridMajorStep,
    onionPrevOpacity,
    onionNextOpacity,
    showNextOnion,
    effectiveGridStep,
  ]);
  useEffect(() => {
    const timeout = setTimeout(() => saveLocalProjectSnapshot(project), 600);
    return () => clearTimeout(timeout);
  }, [project]);
  useEffect(() => {
    const snapshot = JSON.stringify(project);
    if (lastSavedSnapshotRef.current === null)
      lastSavedSnapshotRef.current = snapshot;
    if (!dirty) return;
    if (snapshot === lastSavedSnapshotRef.current) {
      setDirty(false);
      setAutosaveStatus("saved");
      return;
    }
    setAutosaveStatus("dirty");
    const timeout = setTimeout(() => {
      void autosaveProject(project, snapshot);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [project, dirty]);
  useEffect(() => {
    const currentFrame = project.frames[previewFrame] || project.frames[0];
    const ms = clamp(Number(currentFrame?.duration || 1000 / Number(activeAnimation.fps || 6)), 30, 5000);
    const t = setTimeout(() => {
      setPreviewFrame((value) => {
        const last = Math.max(0, project.frames.length - 1);
        if (value >= last) return activeAnimation.loop ? 0 : last;
        return value + 1;
      });
    }, ms);
    return () => clearTimeout(t);
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
    renderAiPreview();
  }, [aiPreview]);
  useEffect(() => {
    schedulePreviewRender();
  }, [project, previewFrame]);
  useEffect(
    () => () => {
      if (canvasRafRef.current !== null) cancelAnimationFrame(canvasRafRef.current);
      if (previewRafRef.current !== null) cancelAnimationFrame(previewRafRef.current);
    },
    [],
  );
  useEffect(() => {
    let es: EventSource | undefined;
    try {
      es = new EventSource(bridgeUrl("/api/events", true));
      es.onopen = () => setBridgeStatus("online");
      es.onerror = () => setBridgeStatus("offline");
      es.addEventListener("project", (e) => {
        try {
          const data = normalizeProject(JSON.parse(e.data));
          const localRevision = projectRef.current.revision;
          if (dirtyRef.current) {
            const ownPendingSave =
              pendingSaveRevisionRef.current === localRevision;
            if (data.revision > localRevision && !ownPendingSave) {
              setAutosaveStatus("conflict");
              setBridgeStatus("conflict");
            }
            return;
          }
          acceptSavedProject(data, "saved");
          setBridgeStatus("sync");
          setTimeout(() => setBridgeStatus("online"), 700);
        } catch {
          setBridgeStatus("erro");
        }
      });
    } catch {
      setBridgeStatus("offline");
    }
    return () => es?.close?.();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      )
        return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoAction();
        return;
      }
      const keyTools: Record<string, Tool> = {
        b: "pencil",
        e: "eraser",
        g: "bucket",
        i: "picker",
        m: "select",
        d: "dither",
        l: "line",
        r: "rect",
        o: "ellipse",
      };
      const nextTool = keyTools[event.key.toLowerCase()];
      if (nextTool) {
        event.preventDefault();
        setTool(nextTool);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => clamp(value + 1, 1, 8));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => clamp(value - 1, 1, 8));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, redo]);
  useEffect(() => {
    void loadMcpPreviews();
    void loadRemoteHistory();
    const timer = setInterval(() => {
      void loadMcpPreviews();
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  function pushHistory(command: HistoryCommand | null) {
    if (!command) return;
    setHistory((h) => [...h.slice(-99), command]);
    setRedo([]);
  }
  function commitHistory(
    before: Project | null,
    after: Project,
    type: HistoryCommandName = "project.change",
    params?: Record<string, unknown>,
  ) {
    if (!before) return;
    pushHistory(createProjectCommand(before, after, type, params, "web"));
  }
  function markDirty() {
    setDirty(true);
    setAutosaveStatus("dirty");
  }
  function acceptSavedProject(
    input: unknown,
    status: AutosaveStatus = "saved",
  ) {
    const next = normalizeProject(input);
    lastSavedSnapshotRef.current = JSON.stringify(next);
    pendingSaveRevisionRef.current = null;
    setDirty(false);
    setAutosaveStatus(status);
    projectRef.current = next;
    setProject(next);
    return next;
  }
  async function autosaveProject(projectToSave: Project, snapshot: string) {
    const expectedRevision = projectToSave.revision;
    pendingSaveRevisionRef.current = expectedRevision;
    setAutosaveStatus("saving");
    try {
      const r = await bridgeFetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: projectToSave,
          revision: expectedRevision,
          source: "autosave",
          addHistory: false,
        }),
      });
      if (r.status === 409) {
        pendingSaveRevisionRef.current = null;
        setAutosaveStatus("conflict");
        setBridgeStatus("conflict");
        return;
      }
      if (!r.ok) throw new Error("autosave_failed");
      const saved = normalizeProject(await r.json());
      const currentSnapshot = JSON.stringify(projectRef.current);
      lastBridgeSave.current = Date.now();
      pendingSaveRevisionRef.current = null;
      if (currentSnapshot !== snapshot) {
        lastSavedSnapshotRef.current = JSON.stringify(saved);
        const current = normalizeProject({
          ...projectRef.current,
          revision: saved.revision,
        });
        projectRef.current = current;
        setProject(current);
        setAutosaveStatus("dirty");
        return;
      }
      acceptSavedProject(saved);
      setBridgeStatus("saved");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      pendingSaveRevisionRef.current = null;
      setAutosaveStatus("error");
      setBridgeStatus("offline");
    }
  }
  function updateProject(
    mutator: (project: Project) => Project | void,
    saveHist = true,
    historyType: HistoryCommandName = "project.change",
    params?: Record<string, unknown>,
  ) {
    markDirty();
    const before = cloneProject(projectRef.current);
    const n = cloneProject(before);
    const next = normalizeProject(mutator(n) || n);
    if (saveHist) commitHistory(before, next, historyType, params);
    projectRef.current = next;
    setProject(next);
  }
  function undo() {
    if (!history.length) return;
    markDirty();
    const command = history[history.length - 1];
    setRedo((r) => [command, ...r]);
    const next = revertCommand(projectRef.current, command);
    projectRef.current = next;
    setProject(next);
    setHistory((h) => h.slice(0, -1));
  }
  function redoAction() {
    if (!redo.length) return;
    markDirty();
    const command = redo[0];
    setHistory((h) => [...h.slice(-99), command]);
    const next = applyCommand(projectRef.current, command);
    projectRef.current = next;
    setProject(next);
    setRedo((r) => r.slice(1));
  }

  function scheduleCanvasRender() {
    if (canvasRafRef.current !== null) return;
    canvasRafRef.current = requestAnimationFrame(() => {
      canvasRafRef.current = null;
      renderCanvas();
    });
  }
  function schedulePreviewRender() {
    if (previewRafRef.current !== null) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      renderPreview();
    });
  }
  function drawFrame(
    ctx: CanvasRenderingContext2D,
    frameToDraw: Frame,
    scale = zoom,
    alpha = 1,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      renderFrameCached(frameToDraw, { mode: "transparent", color: "#0f172a" }),
      0,
      0,
      SIZE * scale,
      SIZE * scale,
    );
    ctx.restore();
  }
  function drawDynamicGrid(ctx: CanvasRenderingContext2D) {
    if (!showGrid) return;
    const step = clamp(Number(effectiveGridStep) || 1, 1, SIZE);
    const opacity = clamp(Number(gridOpacity) || 0, 0, 60) / 100;
    if (!opacity || step * zoom < 2) return;
    const minor = `rgba(148, 163, 184, ${opacity})`;
    const major = `rgba(226, 232, 240, ${Math.min(0.45, opacity * 1.75)})`;
    const drawLines = (spacing: number, strokeStyle: string) => {
      if (!spacing) return;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1;
      for (let i = 0; i <= SIZE; i += spacing) {
        const p = i * zoom + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, SIZE * zoom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(SIZE * zoom, p);
        ctx.stroke();
      }
    };
    ctx.save();
    drawLines(step, minor);
    if (gridMajorStep > step) drawLines(gridMajorStep, major);
    ctx.restore();
  }
  function drawRectOverlay(
    ctx: CanvasRenderingContext2D,
    rect: Selection,
    strokeStyle: string,
  ) {
    const b = selectionBounds(rect);
    if (!b) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      b.x * zoom + 0.5,
      b.y * zoom + 0.5,
      b.w * zoom,
      b.h * zoom,
    );
    ctx.restore();
  }
  function drawShapeOverlay(ctx: CanvasRenderingContext2D) {
    if (!shapePreview) return;
    const { tool: previewTool, start, end } = shapePreview;
    const b = selectionBounds({
      x: start.x,
      y: start.y,
      w: end.x - start.x,
      h: end.y - start.y,
    });
    if (!b) return;
    ctx.save();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (previewTool === "line") {
      ctx.beginPath();
      ctx.moveTo(start.x * zoom + zoom / 2, start.y * zoom + zoom / 2);
      ctx.lineTo(end.x * zoom + zoom / 2, end.y * zoom + zoom / 2);
      ctx.stroke();
    } else if (previewTool === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        (b.x + b.w / 2) * zoom,
        (b.y + b.h / 2) * zoom,
        Math.max(zoom / 2, (b.w * zoom) / 2),
        Math.max(zoom / 2, (b.h * zoom) / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.strokeRect(
        b.x * zoom + 0.5,
        b.y * zoom + 0.5,
        b.w * zoom,
        b.h * zoom,
      );
    }
    ctx.restore();
  }
  function renderCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    const width = SIZE * zoom;
    const height = SIZE * zoom;
    if (c.width !== width) c.width = width;
    if (c.height !== height) c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    fillBackground(ctx, project.background, zoom);
    if (showOnion && frameIndex > 0)
      drawFrame(ctx, project.frames[frameIndex - 1], zoom, onionPrevOpacity / 100);
    drawFrame(ctx, frame, zoom, 1);
    if (showOnion && showNextOnion && frameIndex < project.frames.length - 1)
      drawFrame(
        ctx,
        project.frames[frameIndex + 1],
        zoom,
        onionNextOpacity / 100,
      );
    drawDynamicGrid(ctx);
    if (selection) drawRectOverlay(ctx, selection, "#60a5fa");
    drawShapeOverlay(ctx);
    const now = performance.now();
    if (now - lastRenderStatsUpdateRef.current > 1000) {
      lastRenderStatsUpdateRef.current = now;
      const stats = renderCacheStats();
      setRenderStatsText(
        `layers ${stats.layerHits}/${stats.layerMisses} · frames ${stats.frameHits}/${stats.frameMisses}`,
      );
    }
  }
  function renderPreview() {
    const c = previewRef.current;
    if (!c) return;
    const scale = 2;
    if (c.width !== SIZE * scale) c.width = SIZE * scale;
    if (c.height !== SIZE * scale) c.height = SIZE * scale;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    fillBackground(ctx, project.background, scale);
    drawFrame(ctx, project.frames[previewFrame] || project.frames[0], scale, 1);
  }
  function renderAiPreview() {
    const c = aiPreviewRef.current;
    if (!c) return;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!aiPreview) return;
    const previewFrameToDraw = activeFrameOf(aiPreview.project);
    ctx.drawImage(
      renderFrameFresh(previewFrameToDraw, aiPreview.project.background),
      0,
      0,
      SIZE,
      SIZE,
    );
  }

  function getCell(e: ReactMouseEvent<HTMLCanvasElement>): Point {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.floor((e.clientX - r.left) / zoom),
      y: Math.floor((e.clientY - r.top) / zoom),
    };
  }
  function cloneForActiveLayerEdit(projectInput: Project) {
    const projectNext: Project = {
      ...projectInput,
      godot: { ...projectInput.godot },
      background: { ...projectInput.background },
      palette: [...projectInput.palette],
      assets: [...projectInput.assets],
      frames: [...projectInput.frames],
    };
    const assetIndex = projectNext.assets.findIndex(
      (asset) => asset.id === projectNext.activeAssetId,
    );
    const asset = {
      ...projectNext.assets[Math.max(0, assetIndex)],
      palette: [
        ...(projectNext.assets[Math.max(0, assetIndex)]?.palette ||
          projectNext.palette),
      ],
      animations: [
        ...(projectNext.assets[Math.max(0, assetIndex)]?.animations || []),
      ],
    };
    projectNext.assets[Math.max(0, assetIndex)] = asset;
    const animationIndex = asset.animations.findIndex(
      (animation) => animation.id === projectNext.activeAnimationId,
    );
    const animation = {
      ...asset.animations[Math.max(0, animationIndex)],
      frames: [
        ...(asset.animations[Math.max(0, animationIndex)]?.frames ||
          projectNext.frames),
      ],
    };
    asset.animations[Math.max(0, animationIndex)] = animation;
    projectNext.frames = animation.frames;
    const frameIndexToEdit = Math.max(
      0,
      animation.frames.findIndex((item) => item.id === projectNext.activeFrameId),
    );
    const frameToEdit = {
      ...animation.frames[frameIndexToEdit],
      pivot: { ...animation.frames[frameIndexToEdit].pivot },
      hitboxes: animation.frames[frameIndexToEdit].hitboxes.map((hitbox) => ({
        ...hitbox,
      })),
      layers: [...animation.frames[frameIndexToEdit].layers],
    };
    animation.frames[frameIndexToEdit] = frameToEdit;
    const layerIndexToEdit = activeLayerIndexOf(frameToEdit);
    const layerToEdit = {
      ...frameToEdit.layers[layerIndexToEdit],
      pixels: expandPixels(frameToEdit.layers[layerIndexToEdit].pixels).slice(),
    };
    frameToEdit.layers[layerIndexToEdit] = layerToEdit;
    return { project: projectNext, frame: frameToEdit, layer: layerToEdit };
  }
  function editAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    if (tool === "picker") {
      const picked = expandPixels(activeLayerOf(frame).pixels)[idx(x, y)];
      setColor(picked || color);
      return;
    }
    markDirty();
    const edit = cloneForActiveLayerEdit(projectRef.current);
    const n = edit.project;
    const f = edit.frame;
    const l = edit.layer;
    const cellSize =
      showGrid && paintGridCell ? clamp(effectiveGridStep, 1, SIZE) : 1;
    const cellX = Math.floor(x / cellSize) * cellSize;
    const cellY = Math.floor(y / cellSize) * cellSize;
    const paintCell = (valueFn) => {
      for (let yy = cellY; yy < Math.min(SIZE, cellY + cellSize); yy++)
        for (let xx = cellX; xx < Math.min(SIZE, cellX + cellSize); xx++)
          l.pixels[idx(xx, yy)] = valueFn(xx, yy);
    };
    if (tool === "pencil") paintCell(() => color);
    if (tool === "eraser") paintCell(() => null);
    if (tool === "bucket") floodFillFrame(f, activeLayerIndexOf(f), x, y, color);
    if (tool === "dither")
      paintCell((xx, yy) => ((xx + yy) % 2 === 0 ? color : null));
    const next = n;
    projectRef.current = next;
    setProject(next);
  }
  function isShapeTool(value: Tool): value is ShapeTool {
    return value === "line" || value === "rect" || value === "ellipse";
  }
  function boundsFromPoints(start: Point, end: Point) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x) + 1,
      h: Math.abs(end.y - start.y) + 1,
    };
  }
  function applyShapeTool(start: Point, end: Point) {
    const shapeTool = tool;
    updateProject(
      (p) => {
        const layer = activeLayerOf(activeFrameOf(p));
        if (shapeTool === "line") {
          drawLine(layer, start.x, start.y, end.x, end.y, color, 1);
          return;
        }
        const b = boundsFromPoints(start, end);
        if (shapeTool === "rect") {
          drawRect(layer, b.x, b.y, b.w, b.h, color);
          return;
        }
        const rx = Math.max(1, Math.floor(b.w / 2));
        const ry = Math.max(1, Math.floor(b.h / 2));
        drawEllipse(layer, b.x + rx, b.y + ry, rx, ry, color);
      },
      true,
      shapeTool === "line"
        ? "drawLine"
        : shapeTool === "rect"
          ? "drawRect"
          : "drawEllipse",
      {
        tool: shapeTool,
        color,
        from: start,
        to: end,
      },
    );
  }
  function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    const p = getCell(e);
    lastCellRef.current = p;
    if (tool === "select") {
      setSelectionStart(p);
      setSelection({ ...p, w: 0, h: 0 });
      return;
    }
    if (isShapeTool(tool)) {
      shapeStartRef.current = p;
      setShapePreview({ tool, start: p, end: p });
      drawingRef.current = true;
      return;
    }
    strokeBeforeRef.current = cloneProject(projectRef.current);
    drawingRef.current = true;
    editAt(p.x, p.y);
  }
  function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    const p = getCell(e);
    lastCellRef.current = p;
    if (tool === "select" && selectionStart) {
      setSelection({
        x: selectionStart.x,
        y: selectionStart.y,
        w: p.x - selectionStart.x,
        h: p.y - selectionStart.y,
      });
      return;
    }
    if (drawingRef.current && isShapeTool(tool) && shapeStartRef.current) {
      setShapePreview({ tool, start: shapeStartRef.current, end: p });
      return;
    }
    if (drawingRef.current && e.buttons === 1) editAt(p.x, p.y);
  }
  function onMouseUp(e?: ReactMouseEvent<HTMLCanvasElement>) {
    if (e) lastCellRef.current = getCell(e);
    if (drawingRef.current && isShapeTool(tool) && shapeStartRef.current) {
      applyShapeTool(shapeStartRef.current, lastCellRef.current || shapeStartRef.current);
      shapeStartRef.current = null;
      setShapePreview(null);
      drawingRef.current = false;
      return;
    }
    if (drawingRef.current) {
      const type =
        tool === "bucket"
          ? "floodFill"
          : tool === "pencil" || tool === "eraser"
            ? paintGridCell && effectiveGridStep > 1
              ? "drawRect"
              : "setPixel"
            : "project.change";
      commitHistory(strokeBeforeRef.current, projectRef.current, type, {
        tool,
        color: tool === "eraser" ? null : color,
      });
      strokeBeforeRef.current = null;
    }
    drawingRef.current = false;
    setSelectionStart(null);
  }

  function addLayer() {
    updateProject((p) => {
      const f = activeFrameOf(p);
      const l = blankLayer(`Layer ${f.layers.length + 1}`);
      f.layers.push(l);
      f.activeLayerId = l.id;
    }, true, "layer.add");
  }
  function removeLayer(id: string) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      if (f.layers.length === 1) return;
      f.layers = f.layers.filter((l) => l.id !== id);
      f.activeLayerId = f.layers[0].id;
    }, true, "layer.remove", { layerId: id });
  }
  function moveLayer(i: number, dir: number) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      const j = i + dir;
      if (j < 0 || j >= f.layers.length) return;
      [f.layers[i], f.layers[j]] = [f.layers[j], f.layers[i]];
    }, true, "project.change", { operation: "layer.move", from: i, to: i + dir });
  }
  function updateLayer(i: number, mutator: (layer: Layer) => void) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      mutator(f.layers[i]);
    }, false);
  }
  function updateActiveFrame(mutator: (frame: Frame) => void) {
    updateProject((p) => {
      mutator(activeFrameOf(p));
    });
  }
  function addFrameBox(kind: BoxKind) {
    updateActiveFrame((frame) => {
      frame.hitboxes.push({
        id: uid(),
        name: kind,
        x: Math.max(0, Math.floor(frame.pivot.x) - 16),
        y: Math.max(0, Math.floor(frame.pivot.y) - 16),
        w: 32,
        h: 32,
      });
    });
  }
  function setActiveAsset(id: string) {
    updateProject((p) => {
      const asset = p.assets.find((item) => item.id === id);
      if (!asset) return;
      p.activeAssetId = asset.id;
      p.activeAnimationId = asset.animations[0].id;
      p.activeFrameId = asset.animations[0].frames[0]?.id || "";
    }, false);
  }
  function setActiveAnimation(id: string) {
    updateProject((p) => {
      const asset = activeAssetOf(p);
      const animation = asset.animations.find((item) => item.id === id);
      if (!animation) return;
      p.activeAnimationId = animation.id;
      p.activeFrameId = animation.frames[0]?.id || "";
    }, false);
  }
  function addAnimation() {
    updateProject((p) => {
      const asset = activeAssetOf(p);
      const direction = p.godot.direction;
      const frame = blankFrame(`Frame 1`);
      const animation = {
        id: uid(),
        name: `anim_${asset.animations.length + 1}_${direction.toLowerCase()}`,
        direction,
        fps: p.godot.fps,
        loop: p.godot.loop,
        frames: [frame],
      };
      asset.animations.push(animation);
      p.activeAnimationId = animation.id;
      p.activeFrameId = frame.id;
    }, true, "project.change", { operation: "animation.add" });
  }
  function setGodotField(k: keyof Project["godot"], v: Project["godot"][keyof Project["godot"]]) {
    updateProject((p) => {
      p.godot = { ...p.godot, [k]: v };
      syncActiveAnimationMeta(p);
    }, false);
  }
  function setBackgroundField(
    k: keyof ProjectBackground,
    v: ProjectBackground[keyof ProjectBackground],
  ) {
    updateProject((p) => {
      p.background = {
        ...(p.background || { mode: "transparent", color: "#0f172a" }),
        [k]: v,
      };
    }, false);
  }
  function addFrame() {
    updateProject((p) => {
      const f = blankFrame(`Frame ${p.frames.length + 1}`);
      p.frames.push(f);
      p.activeFrameId = f.id;
    }, true, "frame.add");
  }
  function duplicateFrame() {
    updateProject((p) => {
      const f = cloneProject(activeFrameOf(p));
      f.id = uid();
      f.name = `${f.name} copy`;
      f.layers.forEach((l) => (l.id = uid()));
      f.activeLayerId = f.layers[0].id;
      p.frames.splice(activeFrameIndex(p) + 1, 0, f);
      p.activeFrameId = f.id;
    }, true, "frame.duplicate");
  }
  function removeFrame(id: string) {
    updateProject((p) => {
      if (p.frames.length === 1) return;
      p.frames = p.frames.filter((f) => f.id !== id);
      p.activeFrameId = p.frames[0].id;
    }, true, "frame.remove", { frameId: id });
  }
  function moveFrame(i: number, dir: number) {
    updateProject((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.frames.length) return;
      [p.frames[i], p.frames[j]] = [p.frames[j], p.frames[i]];
    }, true, "frame.move", { from: i, to: i + dir });
  }

  function copySelection(cut = false) {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    setClipboard(clip);
    if (cut)
      updateProject((p) => {
        const l = activeLayerOf(activeFrameOf(p));
        for (let y = 0; y < clip.h; y++)
          for (let x = 0; x < clip.w; x++)
            l.pixels[idx(clip.x + x, clip.y + y)] = null;
      });
  }
  function pasteSelection() {
    if (!clipboard) return;
    const b = selectionBounds(selection) || { x: clipboard.x, y: clipboard.y };
    updateProject((p) =>
      pastePixels(activeLayerOf(activeFrameOf(p)), clipboard, b.x, b.y),
    );
    setSelection({ x: b.x, y: b.y, w: clipboard.w - 1, h: clipboard.h - 1 });
  }
  function moveSelection(dx: number, dy: number) {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    updateProject((p) =>
      pastePixels(
        activeLayerOf(activeFrameOf(p)),
        clip,
        clip.x + dx,
        clip.y + dy,
        true,
      ),
    );
    setSelection({
      x: clip.x + dx,
      y: clip.y + dy,
      w: clip.w - 1,
      h: clip.h - 1,
    });
  }
  function transformSelection(kind: "mirrorH" | "mirrorV" | "rotate90") {
    const clip = getSelectionPixels(activeLayerOf(frame), selection);
    if (!clip) return;
    let nextClip: Clip;
    if (kind === "rotate90") {
      nextClip = rotate90Selection(clip);
    } else {
      const pixels = new Array(clip.pixels.length).fill(null);
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++)
          pixels[
            kind === "mirrorH"
              ? y * clip.w + (clip.w - 1 - x)
              : (clip.h - 1 - y) * clip.w + x
          ] = clip.pixels[y * clip.w + x];
      nextClip = { ...clip, pixels };
    }
    updateProject((p) => {
      const layer = activeLayerOf(activeFrameOf(p));
      eraseClipPixels(layer, clip);
      pastePixels(layer, nextClip, clip.x, clip.y);
    });
    setSelection({
      x: clip.x,
      y: clip.y,
      w: nextClip.w - 1,
      h: nextClip.h - 1,
    });
  }
  function applyDitherToSelection() {
    const b = selectionBounds(selection);
    if (!b) return;
    updateProject((p) => {
      const l = activeLayerOf(activeFrameOf(p));
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++)
          if ((x + y) % 2 === 0) l.pixels[idx(b.x + x, b.y + y)] = color;
    });
  }
  function replaceGlobalColor() {
    updateProject((p) => replaceProjectColor(p, replaceFrom, replaceTo));
  }
  function limitColorsNow() {
    updateProject((p) => limitProjectColors(p, maxColors));
  }
  function importPalette(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((text) => {
      const colors = text.trim().startsWith("[")
        ? JSON.parse(text)
        : text.match(/#[0-9a-fA-F]{6}/g);
      if (Array.isArray(colors) && colors.length)
        updateProject((p) => {
          p.palette = [...new Set(colors.map((c) => String(c).toLowerCase()))];
          activeAssetOf(p).palette = p.palette;
        }, false);
    });
  }
  function loadJson(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files[0];
    if (!f) return;
    readJsonFile(f).then((json) => {
      const before = projectRef.current;
      const next = normalizeProject(json);
      commitHistory(before, next, "project.replace", { source: "json" });
      markDirty();
      projectRef.current = next;
      setProject(next);
    });
  }
  function exportPng() {
    downloadCanvas(
      `${slug(project.godot.asset)}_${slug(project.godot.animation)}_f${frameIndex + 1}.png`,
      renderFrameFresh(frame, project.background),
    );
  }
  function exportSpritesheet() {
    const sheet = document.createElement("canvas");
    sheet.width = SIZE * project.frames.length;
    sheet.height = SIZE;
    const ctx = sheet.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    project.frames.forEach((f, i) =>
      ctx.drawImage(renderFrameFresh(f, project.background), i * SIZE, 0),
    );
    downloadCanvas(
      `${slug(project.godot.asset)}_${slug(project.godot.animation)}_sheet.png`,
      sheet,
    );
  }
  function exportAtlasJson() {
    const asset = slug(project.godot.asset),
      anim = slug(project.godot.animation);
    downloadText(
      `${asset}_${anim}.atlas.json`,
      JSON.stringify(atlasMetadata(project), null, 2),
    );
  }
  function exportGodotJson() {
    const asset = slug(project.godot.asset);
    downloadText(
      `${asset}.animations.json`,
      JSON.stringify(godotMetadata(project), null, 2),
    );
  }
  function exportUnityJson() {
    const asset = slug(project.godot.asset),
      anim = slug(project.godot.animation);
    downloadText(
      `${asset}_${anim}.unity.json`,
      JSON.stringify(unityMetadata(project), null, 2),
    );
  }
  function saveJson() {
    downloadText("pixel-project.json", JSON.stringify(project, null, 2));
  }
  async function saveBackend() {
    try {
      const r = await bridgeFetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          revision: project.revision,
          addHistory: true,
        }),
      });
      if (r.status === 409) {
        setAutosaveStatus("conflict");
        setBridgeStatus("conflict");
        return;
      }
      if (!r.ok) throw new Error("save_failed");
      acceptSavedProject(await r.json());
      lastBridgeSave.current = Date.now();
      setBridgeStatus("saved");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function loadBackend() {
    try {
      const r = await bridgeFetch("/api/project");
      if (r.ok) {
        const before = projectRef.current;
        const next = normalizeProject(await r.json());
        commitHistory(before, next, "project.replace", { source: "bridge" });
        acceptSavedProject(next);
        setBridgeStatus("loaded");
        setTimeout(() => setBridgeStatus("online"), 700);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function loadGalleryList() {
    try {
      const r = await bridgeFetch("/api/gallery");
      if (r.ok) setGallery(await r.json());
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function loadRemoteHistory() {
    try {
      const r = await bridgeFetch("/api/history");
      if (r.ok) setRemoteHistory(await r.json());
    } catch {}
  }
  async function loadMcpPreviews() {
    try {
      if (previewStateRef.current?.source === "ai") return;
      const r = await bridgeFetch("/api/mcp-previews");
      if (!r.ok) return;
      const previews = await r.json();
      const first = Array.isArray(previews) ? previews[0] : null;
      if (!first) {
        if (previewStateRef.current?.source === "mcp") setAiPreview(null);
        return;
      }
      setAiPreview({
        id: first.id,
        project: normalizeProject(first.project),
        provider: first.source || "mcp",
        providerKind: "local",
        prompt: first.command?.prompt || "",
        operation: "edit",
        source: "mcp",
        summary: first.summary,
      });
      setBridgeStatus("prompt");
    } catch {}
  }
  async function saveGallery() {
    try {
      const r = await bridgeFetch("/api/gallery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: project.godot.asset, project }),
      });
      if (r.ok) {
        await loadGalleryList();
        setBridgeStatus("gallery-saved");
        setTimeout(() => setBridgeStatus("online"), 700);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function loadGalleryItem(id: string) {
    try {
      const r = await bridgeFetch(`/api/gallery/${id}`);
      if (r.ok) {
        const before = projectRef.current;
        const next = normalizeProject(await r.json());
        commitHistory(before, next, "project.replace", { source: "gallery", id });
        acceptSavedProject(next);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function applyPrompt() {
    try {
      const r = await bridgeFetch("/api/ai-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          operation: aiOperation,
          project,
          revision: project.revision,
          selection,
        }),
      });
      if (r.status === 409) {
        setAutosaveStatus("conflict");
        setBridgeStatus("conflict");
        return;
      }
      if (!r.ok) throw new Error("bridge off");
      const data = await r.json();
      setAiPreview({
        id: data.id,
        project: normalizeProject(data.project),
        provider: data.provider || "unknown",
        providerKind: data.providerKind || "http",
        model: data.model,
        prompt,
        operation: aiOperation,
        source: "ai",
        summary: data.summary,
      });
      setBridgeStatus(data.providerKind === "local" ? "local-prompt" : "prompt");
    } catch {
      const next =
        aiOperation === "generate"
          ? generatePixelArtFromPrompt(prompt, project)
          : project;
      setAiPreview({
        project: normalizeProject(next),
        provider: "local-heuristic/browser",
        providerKind: "local",
        prompt,
        operation: aiOperation,
        source: "ai",
      });
      setBridgeStatus("local-prompt");
    }
  }
  async function acceptAiPreview() {
    if (!aiPreview) return;
    const before = projectRef.current;
    if (aiPreview.id) {
      try {
        const acceptPath =
          aiPreview.source === "mcp"
            ? `/api/mcp-preview/${aiPreview.id}/accept`
            : `/api/ai-preview/${aiPreview.id}/accept`;
        const r = await bridgeFetch(acceptPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: project.revision }),
        });
        if (r.status === 409) {
          setAutosaveStatus("conflict");
          setBridgeStatus("conflict");
          return;
        }
        if (!r.ok) throw new Error("preview_accept_failed");
        const next = normalizeProject(await r.json());
        commitHistory(before, next, aiPreview.source === "mcp" ? "mcp.diff" : "project.change", {
          operation: aiPreview.operation,
          prompt: aiPreview.prompt,
          provider: aiPreview.provider,
          providerKind: aiPreview.providerKind,
        });
        acceptSavedProject(next);
        setAiPreview(null);
        void loadRemoteHistory();
        setBridgeStatus("saved");
        setTimeout(() => setBridgeStatus("online"), 700);
        return;
      } catch {
        setBridgeStatus("offline");
        return;
      }
    }
    const next = normalizeProject(aiPreview.project);
    commitHistory(before, next, "project.change", {
      operation: aiPreview.operation,
      prompt: aiPreview.prompt,
      provider: aiPreview.provider,
      providerKind: aiPreview.providerKind,
      fallback: true,
    });
    markDirty();
    projectRef.current = next;
    setProject(next);
    setAiPreview(null);
    setBridgeStatus("local-prompt");
  }
  async function rejectAiPreview() {
    if (aiPreview?.id) {
      try {
        const rejectPath =
          aiPreview.source === "mcp"
            ? `/api/mcp-preview/${aiPreview.id}`
            : `/api/ai-preview/${aiPreview.id}`;
        await bridgeFetch(rejectPath, {
          method: "DELETE",
        });
      } catch {}
    }
    setAiPreview(null);
  }

  return (
    <main>
      <aside className="panel left">
        <h1>Pixel ART 256</h1>
        <label>
          Cor{" "}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <div className="palette">
          {project.palette.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              title={c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="tools">
          {[
            "pencil",
            "eraser",
            "bucket",
            "picker",
            "select",
            "dither",
            "line",
            "rect",
            "ellipse",
          ].map((t) => (
              <button
                key={t}
                className={tool === t ? "active" : ""}
                onClick={() => setTool(t as Tool)}
              >
                {t}
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
            onChange={(e) => setZoom(+e.target.value)}
          />{" "}
          {zoom}x
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />{" "}
          grade
        </label>
        <div className="grid-settings">
          <label>
            Modo da grade{" "}
            <select
              value={gridMode}
              onChange={(e) => setGridMode(e.target.value)}
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
              onChange={(e) => setGridDensity(e.target.value)}
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
              onChange={(e) => setGridStep(+e.target.value)}
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
              onChange={(e) => setGridOpacity(+e.target.value)}
            />{" "}
            {gridOpacity}%
          </label>
          <label>
            Linha forte{" "}
            <select
              value={gridMajorStep}
              disabled={!showGrid}
              onChange={(e) => setGridMajorStep(+e.target.value)}
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
              onChange={(e) => setPaintGridCell(e.target.checked)}
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
            onChange={(e) => setShowOnion(e.target.checked)}
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
              onChange={(e) => setOnionPrevOpacity(+e.target.value)}
            />{" "}
            {onionPrevOpacity}%
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showNextOnion}
              disabled={!showOnion}
              onChange={(e) => setShowNextOnion(e.target.checked)}
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
              onChange={(e) => setOnionNextOpacity(+e.target.value)}
            />{" "}
            {onionNextOpacity}%
          </label>
        </div>

        <h2>Fundo</h2>
        <label>
          Tipo{" "}
          <select
            value={project.background.mode}
            onChange={(e) => setBackgroundField("mode", e.target.value)}
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
              onChange={(e) => setBackgroundField("color", e.target.value)}
            />
          </label>
        ) : null}

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
          onChange={(e) => setAiOperation(e.target.value)}
        >
          <option value="generate">gerar/substituir projeto</option>
          <option value="edit_selection">editar seleção</option>
          <option value="edit">editar canvas</option>
          <option value="create_variation">criar variação</option>
        </select>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="4"
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
            Histórico remoto{" "}
            <button onClick={loadRemoteHistory}>atualizar</button>
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
          {gallery.slice(0, 6).map((g) => (
            <button key={g.id} onClick={() => loadGalleryItem(g.id)}>
              {g.name} · {g.frames}f
            </button>
          ))}
        </div>

        <h2>Godot / Unity</h2>
        <label>
          Asset ativo{" "}
          <select
            value={project.activeAssetId}
            onChange={(e) => setActiveAsset(e.target.value)}
          >
            {project.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Animação ativa{" "}
          <select
            value={project.activeAnimationId}
            onChange={(e) => setActiveAnimation(e.target.value)}
          >
            {activeAsset.animations.map((animation) => (
              <option key={animation.id} value={animation.id}>
                {animation.name} · {animation.direction}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addAnimation}>+ animação</button>
        <div className="status">
          Modelo: {project.assets.length} asset(s) ·{" "}
          {activeAsset.animations.length} animação(ões) ·{" "}
          {activeAnimation.frames.length} frame(s)
        </div>
        <label>
          Asset{" "}
          <input
            value={project.godot.asset}
            onChange={(e) => setGodotField("asset", e.target.value)}
          />
        </label>
        <label>
          Animação{" "}
          <select
            value={project.godot.animation.split("_")[0]}
            onChange={(e) =>
              setGodotField(
                "animation",
                `${e.target.value}_${project.godot.direction.toLowerCase()}`,
              )
            }
          >
            {DEFAULT_ANIMS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Direção{" "}
          <select
            value={project.godot.direction}
            onChange={(e) => {
              setGodotField("direction", e.target.value);
              setGodotField(
                "animation",
                `${project.godot.animation.split("_")[0]}_${e.target.value.toLowerCase()}`,
              );
            }}
          >
            {DIRECTIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          FPS{" "}
          <input
            type="number"
            min="1"
            max="60"
            value={project.godot.fps}
            onChange={(e) => setGodotField("fps", +e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={project.godot.loop}
            onChange={(e) => setGodotField("loop", e.target.checked)}
          />{" "}
          loop
        </label>
        <button onClick={exportPng}>PNG frame</button>
        <button onClick={exportSpritesheet}>Spritesheet</button>
        <button onClick={exportAtlasJson}>Atlas JSON</button>
        <button onClick={exportGodotJson}>Godot JSON</button>
        <button onClick={exportUnityJson}>Unity JSON</button>
        <button onClick={saveJson}>Salvar projeto</button>
        <input type="file" accept="application/json" onChange={loadJson} />
      </aside>

      <section className="stage">
        <canvas
          ref={canvasRef}
          style={{ "--checker-size": `${checkerSize}px` }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </section>

      <aside className="panel right">
        <h2>Preview animado</h2>
        <canvas className="preview" ref={previewRef} />
        <div className="status">
          {activeAnimation.name} · {activeAnimation.direction} · frame{" "}
          {Math.min(previewFrame + 1, project.frames.length)}/
          {project.frames.length} ·{" "}
          {project.frames[previewFrame]?.duration || 0}ms
          {activeAnimation.loop ? " · loop" : " · sem loop"}
        </div>
        <div className="timeline">
          <button onClick={addFrame}>+ frame</button>
          <button onClick={duplicateFrame}>duplicar</button>
          {project.frames.map((fr, i) => (
            <div
              key={fr.id}
              className={
                "frame " + (fr.id === project.activeFrameId ? "active" : "")
              }
              onClick={() =>
                updateProject((p) => {
                  p.activeFrameId = fr.id;
                }, false)
              }
            >
              <FrameThumbnail frame={fr} background={project.background} />
              <span>{i + 1}</span>
              <input
                value={fr.name}
                onChange={(e) =>
                  updateProject((p) => {
                    p.frames[i].name = e.target.value;
                  }, false)
                }
              />
              <input
                type="number"
                min="1"
                max="5000"
                value={fr.duration}
                title="Duração em ms"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  updateProject((p) => {
                    p.frames[i].duration = clamp(+e.target.value || 1, 1, 5000);
                  })
                }
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  moveFrame(i, -1);
                }}
              >
                ↑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  moveFrame(i, 1);
                }}
              >
                ↓
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFrame(fr.id);
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>

        <h2>Game data</h2>
        <div className="game-data">
          <div className="two-cols">
            <label>
              Pivot X{" "}
              <input
                type="number"
                min="0"
                max={SIZE - 1}
                value={frame.pivot.x}
                onChange={(e) =>
                  updateActiveFrame((fr) => {
                    fr.pivot.x = clamp(+e.target.value || 0, 0, SIZE - 1);
                  })
                }
              />
            </label>
            <label>
              Pivot Y{" "}
              <input
                type="number"
                min="0"
                max={SIZE - 1}
                value={frame.pivot.y}
                onChange={(e) =>
                  updateActiveFrame((fr) => {
                    fr.pivot.y = clamp(+e.target.value || 0, 0, SIZE - 1);
                  })
                }
              />
            </label>
          </div>
          <div className="grid-buttons">
            <button onClick={() => addFrameBox("hitbox")}>+ hitbox</button>
            <button onClick={() => addFrameBox("hurtbox")}>+ hurtbox</button>
            <button onClick={() => addFrameBox("attackbox")}>+ attackbox</button>
          </div>
          {frame.hitboxes.map((box, i) => (
            <div className="box-row" key={box.id}>
              <input
                value={box.name}
                onChange={(e) =>
                  updateActiveFrame((fr) => {
                    fr.hitboxes[i].name = e.target.value;
                  })
                }
              />
              {(["x", "y", "w", "h"] as const).map((field) => (
                <input
                  key={field}
                  type="number"
                  min={field === "w" || field === "h" ? 1 : 0}
                  max={SIZE}
                  value={box[field]}
                  title={field}
                  onChange={(e) =>
                    updateActiveFrame((fr) => {
                      fr.hitboxes[i][field] = clamp(
                        +e.target.value || (field === "w" || field === "h" ? 1 : 0),
                        field === "w" || field === "h" ? 1 : 0,
                        SIZE,
                      );
                    })
                  }
                />
              ))}
              <button
                onClick={() =>
                  updateActiveFrame((fr) => {
                    fr.hitboxes = fr.hitboxes.filter((item) => item.id !== box.id);
                  })
                }
              >
                x
              </button>
            </div>
          ))}
        </div>

        <h2>Seleção</h2>
        <div className="grid-buttons">
          <button onClick={() => copySelection(false)}>copiar</button>
          <button onClick={() => copySelection(true)}>recortar</button>
          <button onClick={pasteSelection}>colar</button>
          <button onClick={() => moveSelection(-1, 0)}>←</button>
          <button onClick={() => moveSelection(1, 0)}>→</button>
          <button onClick={() => moveSelection(0, -1)}>↑</button>
          <button onClick={() => moveSelection(0, 1)}>↓</button>
          <button onClick={() => transformSelection("mirrorH")}>
            espelhar H
          </button>
          <button onClick={() => transformSelection("mirrorV")}>
            espelhar V
          </button>
          <button onClick={() => transformSelection("rotate90")}>
            rotacionar 90
          </button>
          <button onClick={applyDitherToSelection}>dithering</button>
        </div>

        <h2>Paleta / QA</h2>
        <label>
          Limite de cores{" "}
          <input
            type="number"
            min="2"
            max="256"
            value={maxColors}
            onChange={(e) => setMaxColors(+e.target.value)}
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
            onChange={(e) => setReplaceFrom(e.target.value)}
          />
        </label>
        <label>
          Para{" "}
          <input
            type="color"
            value={replaceTo}
            onChange={(e) => setReplaceTo(e.target.value)}
          />
        </label>
        <button onClick={replaceGlobalColor}>substituir cor global</button>
        <button
          onClick={() =>
            downloadText(
              "palette.json",
              JSON.stringify(project.palette, null, 2),
            )
          }
        >
          exportar paleta
        </button>
        <input type="file" accept=".json,.gpl,.txt" onChange={importPalette} />
        <div className="used">
          {usedColors.slice(0, 48).map(([c, n]) => (
            <button
              key={c}
              style={{ background: c }}
              title={`${c} (${n})`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <h2>Camadas</h2>
        <button onClick={addLayer}>+ camada</button>
        <button onClick={undo}>Undo</button>
        <button onClick={redoAction}>Redo</button>
        {frame.layers.map((l, i) => (
          <div
            className={"layer " + (i === layerIndex ? "active" : "")}
            key={l.id}
            onClick={() =>
              updateProject((p) => {
                activeFrameOf(p).activeLayerId = l.id;
              }, false)
            }
          >
            <input
              value={l.name}
              onChange={(e) =>
                updateLayer(i, (layer) => {
                  layer.name = e.target.value;
                })
              }
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(i, (layer) => {
                  layer.visible = !layer.visible;
                });
              }}
            >
              {l.visible ? "👁" : "—"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveLayer(i, -1);
              }}
            >
              ↑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveLayer(i, 1);
              }}
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeLayer(l.id);
              }}
            >
              x
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={l.opacity}
              onChange={(e) =>
                updateLayer(i, (layer) => {
                  layer.opacity = +e.target.value;
                })
              }
            />
          </div>
        ))}
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
