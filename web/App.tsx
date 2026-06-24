import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  activeFrameOf,
  activeLayerOf,
  atlasMetadata,
  blankFrame,
  blankLayer,
  clamp,
  clone,
  colorsUsed,
  compositeFrameRgba,
  DIRECTIONS,
  expandPixels,
  generatePixelArtFromPrompt,
  godotMetadata,
  indexOf,
  isHex,
  limitColors as limitProjectColors,
  normalizeProject,
  qualityReport,
  replaceGlobalColor as replaceProjectColor,
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
  Project,
  ProjectBackground,
  Selection,
} from "../shared/pixel-core.ts";
import "./style.css";

type Tool = "pencil" | "eraser" | "bucket" | "picker" | "select" | "dither";
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
type Clip = Selection & { pixels: PixelArray };
type GalleryItem = {
  id: string;
  name: string;
  frames: number;
};

const DEFAULT_ZOOM = 3;
const AUTOSAVE_DEBOUNCE_MS = 900;
const BRIDGE_URL =
  import.meta.env.VITE_PIXEL_BRIDGE_URL || "http://localhost:8787";
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
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
    const i = idx(cx, cy);
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
function compositeFrame(
  frame: Frame,
  background: ProjectBackground = { mode: "transparent", color: "#0f172a" },
) {
  const out = document.createElement("canvas");
  out.width = SIZE;
  out.height = SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(compositeFrameRgba(frame, background)),
      SIZE,
      SIZE,
    ),
    0,
    0,
  );
  return out;
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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastBridgeSave = useRef(0);
  const [project, setProject] = useState<Project>(() =>
    normalizeProject(
      JSON.parse(localStorage.getItem("pixel-project") || "null"),
    ),
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
  const [history, setHistory] = useState<Project[]>([]);
  const [redo, setRedo] = useState<Project[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [prompt, setPrompt] = useState("crie personagem idle oeste");
  const [aiOperation, setAiOperation] = useState<AiOperation>("generate");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("offline");
  const [autosaveStatus, setAutosaveStatus] =
    useState<AutosaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [maxColors, setMaxColors] = useState(32);
  const [replaceFrom, setReplaceFrom] = useState("#ffffff");
  const [replaceTo, setReplaceTo] = useState("#000000");
  const [previewFrame, setPreviewFrame] = useState(0);
  const frame = activeFrameOf(project);
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
    renderCanvas();
  }, [
    project,
    zoom,
    showGrid,
    showOnion,
    selection,
    gridMode,
    gridDensity,
    gridStep,
    gridOpacity,
    gridMajorStep,
    effectiveGridStep,
  ]);
  useEffect(() => {
    localStorage.setItem("pixel-project", JSON.stringify(project));
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
    const ms = Math.max(30, 1000 / Number(project.godot?.fps || 6));
    const t = setInterval(
      () =>
        setPreviewFrame((v) => (v + 1) % Math.max(1, project.frames.length)),
      ms,
    );
    return () => clearInterval(t);
  }, [project.frames.length, project.godot?.fps]);
  useEffect(() => {
    renderPreview();
  }, [project, previewFrame]);
  useEffect(() => {
    let es: EventSource | undefined;
    try {
      es = new EventSource(`${BRIDGE_URL}/api/events`);
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

  function pushHistory() {
    setHistory((h) => [...h.slice(-60), cloneProject(project)]);
    setRedo([]);
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
    setProject(next);
    return next;
  }
  async function autosaveProject(projectToSave: Project, snapshot: string) {
    const expectedRevision = projectToSave.revision;
    pendingSaveRevisionRef.current = expectedRevision;
    setAutosaveStatus("saving");
    try {
      const r = await fetch(`${BRIDGE_URL}/api/project`, {
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
        setProject((current) =>
          normalizeProject({ ...current, revision: saved.revision }),
        );
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
  ) {
    if (saveHist) pushHistory();
    markDirty();
    setProject((p) => {
      const n = cloneProject(p);
      return normalizeProject(mutator(n) || n);
    });
  }
  function undo() {
    if (!history.length) return;
    markDirty();
    setRedo((r) => [cloneProject(project), ...r]);
    setProject(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }
  function redoAction() {
    if (!redo.length) return;
    markDirty();
    setHistory((h) => [...h, cloneProject(project)]);
    setProject(redo[0]);
    setRedo((r) => r.slice(1));
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
      compositeFrame(frameToDraw, { mode: "transparent", color: "#0f172a" }),
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
  function renderCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    c.width = SIZE * zoom;
    c.height = SIZE * zoom;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    fillBackground(ctx, project.background, zoom);
    if (showOnion && frameIndex > 0)
      drawFrame(ctx, project.frames[frameIndex - 1], zoom, 0.25);
    drawFrame(ctx, frame, zoom, 1);
    drawDynamicGrid(ctx);
    if (selection) {
      const b = selectionBounds(selection);
      if (b) {
        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          b.x * zoom + 0.5,
          b.y * zoom + 0.5,
          b.w * zoom,
          b.h * zoom,
        );
        ctx.setLineDash([]);
      }
    }
  }
  function renderPreview() {
    const c = previewRef.current;
    if (!c) return;
    const scale = 2;
    c.width = SIZE * scale;
    c.height = SIZE * scale;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    fillBackground(ctx, project.background, scale);
    drawFrame(ctx, project.frames[previewFrame] || project.frames[0], scale, 1);
  }

  function getCell(e: ReactMouseEvent<HTMLCanvasElement>): Point {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.floor((e.clientX - r.left) / zoom),
      y: Math.floor((e.clientY - r.top) / zoom),
    };
  }
  function editAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    markDirty();
    setProject((p) => {
      const n = cloneProject(p);
      const f = activeFrameOf(n);
      const l = activeLayerOf(f);
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
      if (tool === "picker") setColor(l.pixels[idx(x, y)] || color);
      if (tool === "bucket")
        floodFillFrame(f, activeLayerIndexOf(f), x, y, color);
      if (tool === "dither")
        paintCell((xx, yy) => ((xx + yy) % 2 === 0 ? color : null));
      return normalizeProject(n);
    });
  }
  function onMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    const p = getCell(e);
    if (tool === "select") {
      setSelectionStart(p);
      setSelection({ ...p, w: 0, h: 0 });
      return;
    }
    pushHistory();
    drawingRef.current = true;
    editAt(p.x, p.y);
  }
  function onMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    const p = getCell(e);
    if (tool === "select" && selectionStart) {
      setSelection({
        x: selectionStart.x,
        y: selectionStart.y,
        w: p.x - selectionStart.x,
        h: p.y - selectionStart.y,
      });
      return;
    }
    if (drawingRef.current && e.buttons === 1) editAt(p.x, p.y);
  }
  function onMouseUp() {
    drawingRef.current = false;
    setSelectionStart(null);
  }

  function addLayer() {
    updateProject((p) => {
      const f = activeFrameOf(p);
      const l = blankLayer(`Layer ${f.layers.length + 1}`);
      f.layers.push(l);
      f.activeLayerId = l.id;
    });
  }
  function removeLayer(id: string) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      if (f.layers.length === 1) return;
      f.layers = f.layers.filter((l) => l.id !== id);
      f.activeLayerId = f.layers[0].id;
    });
  }
  function moveLayer(i: number, dir: number) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      const j = i + dir;
      if (j < 0 || j >= f.layers.length) return;
      [f.layers[i], f.layers[j]] = [f.layers[j], f.layers[i]];
    });
  }
  function updateLayer(i: number, mutator: (layer: Layer) => void) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      mutator(f.layers[i]);
    }, false);
  }
  function setGodotField(k: keyof Project["godot"], v: Project["godot"][keyof Project["godot"]]) {
    updateProject((p) => {
      p.godot = { ...p.godot, [k]: v };
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
    });
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
    });
  }
  function removeFrame(id: string) {
    updateProject((p) => {
      if (p.frames.length === 1) return;
      p.frames = p.frames.filter((f) => f.id !== id);
      p.activeFrameId = p.frames[0].id;
    });
  }
  function moveFrame(i: number, dir: number) {
    updateProject((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.frames.length) return;
      [p.frames[i], p.frames[j]] = [p.frames[j], p.frames[i]];
    });
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
    let pixels = new Array(clip.pixels.length).fill(null),
      w = clip.w,
      h = clip.h;
    for (let y = 0; y < clip.h; y++)
      for (let x = 0; x < clip.w; x++) {
        const src = clip.pixels[y * clip.w + x];
        if (kind === "mirrorH") pixels[y * w + (w - 1 - x)] = src;
        if (kind === "mirrorV") pixels[(h - 1 - y) * w + x] = src;
        if (kind === "rotate90") {
          w = clip.h;
          h = clip.w;
          pixels = new Array(w * h).fill(null);
        }
      }
    if (kind === "rotate90")
      for (let y = 0; y < clip.h; y++)
        for (let x = 0; x < clip.w; x++)
          pixels[x * w + (w - 1 - y)] = clip.pixels[y * clip.w + x];
    updateProject((p) =>
      pastePixels(
        activeLayerOf(activeFrameOf(p)),
        { ...clip, w, h, pixels },
        clip.x,
        clip.y,
        true,
      ),
    );
    setSelection({ x: clip.x, y: clip.y, w: w - 1, h: h - 1 });
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
        }, false);
    });
  }
  function loadJson(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files[0];
    if (!f) return;
    readJsonFile(f).then((json) => {
      pushHistory();
      markDirty();
      setProject(normalizeProject(json));
    });
  }
  function exportPng() {
    downloadCanvas(
      `${slug(project.godot.asset)}_${slug(project.godot.animation)}_f${frameIndex + 1}.png`,
      compositeFrame(frame, project.background),
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
      ctx.drawImage(compositeFrame(f, project.background), i * SIZE, 0),
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
      const r = await fetch(`${BRIDGE_URL}/api/project`, {
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
      const r = await fetch(`${BRIDGE_URL}/api/project`);
      if (r.ok) {
        pushHistory();
        acceptSavedProject(await r.json());
        setBridgeStatus("loaded");
        setTimeout(() => setBridgeStatus("online"), 700);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function loadGalleryList() {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/gallery`);
      if (r.ok) setGallery(await r.json());
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function saveGallery() {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/gallery`, {
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
      const r = await fetch(`${BRIDGE_URL}/api/gallery/${id}`);
      if (r.ok) {
        pushHistory();
        acceptSavedProject(await r.json());
      }
    } catch {
      setBridgeStatus("offline");
    }
  }
  async function applyPrompt() {
    pushHistory();
    try {
      const r = await fetch(`${BRIDGE_URL}/api/ai-prompt`, {
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
      acceptSavedProject(await r.json());
      setBridgeStatus("prompt");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      markDirty();
      setProject(
        aiOperation === "generate"
          ? generatePixelArtFromPrompt(prompt, project)
          : project,
      );
      setBridgeStatus("local-prompt");
    }
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
          {["pencil", "eraser", "bucket", "picker", "select", "dither"].map(
            (t) => (
              <button
                key={t}
                className={tool === t ? "active" : ""}
                onClick={() => setTool(t)}
              >
                {t}
              </button>
            ),
          )}
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
        <button onClick={applyPrompt}>Aplicar prompt no canvas</button>
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
              <span>{i + 1}</span>
              <input
                value={fr.name}
                onChange={(e) =>
                  updateProject((p) => {
                    p.frames[i].name = e.target.value;
                  }, false)
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
