import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const SIZE = 256;
const DEFAULT_ZOOM = 3;
const BRIDGE_URL =
  import.meta.env.VITE_PIXEL_BRIDGE_URL || "http://localhost:8787";
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DEFAULT_PALETTE = [
  "#111827",
  "#374151",
  "#6b7280",
  "#d1d5db",
  "#f8fafc",
  "#7f1d1d",
  "#b45309",
  "#f59e0b",
  "#166534",
  "#22c55e",
  "#1d4ed8",
  "#60a5fa",
  "#581c87",
  "#a855f7",
];
const DEFAULT_ANIMS = ["idle", "walk", "attack", "dodge", "skill", "death"];
const uid = () => crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const idx = (x, y, size = SIZE) => y * size + x;
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const gridStepForZoom = (zoom) =>
  zoom <= 1 ? 16 : zoom === 2 ? 8 : zoom === 3 ? 4 : zoom <= 5 ? 2 : 1;
const slug = (v) =>
  String(v || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";

const blankLayer = (name = "Layer") => ({
  id: uid(),
  name,
  visible: true,
  opacity: 1,
  pixels: new Array(SIZE * SIZE).fill(null),
});
const blankFrame = (name = "Frame 1") => {
  const layer = blankLayer("Base");
  return {
    id: uid(),
    name,
    duration: 100,
    layers: [layer],
    activeLayerId: layer.id,
  };
};

function cloneProject(p) {
  return JSON.parse(JSON.stringify(p));
}
function expandPixels(pixels) {
  if (Array.isArray(pixels) && pixels.length === SIZE * SIZE) return pixels;
  if (pixels?.encoding === "rle" && Array.isArray(pixels.runs)) {
    const out = [];
    for (const [count, color] of pixels.runs) {
      for (let i = 0; i < count && out.length < SIZE * SIZE; i++)
        out.push(
          color && /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : null,
        );
    }
    while (out.length < SIZE * SIZE) out.push(null);
    return out;
  }
  return new Array(SIZE * SIZE).fill(null);
}
function normalizeProject(input) {
  const source =
    input?.format === "pixel-art-compact-v1" && input.project
      ? input.project
      : input;
  const p = source && typeof source === "object" ? cloneProject(source) : {};
  p.size = Number(p.size || SIZE);
  if (!Array.isArray(p.frames) || !p.frames.length) {
    const layers =
      Array.isArray(p.layers) && p.layers.length
        ? p.layers
        : [blankLayer("Base")];
    const activeLayerId = p.activeLayerId || layers[0].id;
    p.frames = [
      { id: uid(), name: "Frame 1", duration: 100, layers, activeLayerId },
    ];
    delete p.layers;
  }
  p.frames = p.frames.map((frame, i) => {
    const layers =
      Array.isArray(frame.layers) && frame.layers.length
        ? frame.layers
        : [blankLayer("Base")];
    layers.forEach((l, li) => {
      l.id ||= uid();
      l.name ||= `Layer ${li + 1}`;
      l.visible = l.visible !== false;
      l.opacity = Number.isFinite(Number(l.opacity)) ? Number(l.opacity) : 1;
      l.pixels = expandPixels(l.pixels);
    });
    return {
      ...frame,
      id: frame.id || uid(),
      name: frame.name || `Frame ${i + 1}`,
      duration: Number(frame.duration || 100),
      layers,
      activeLayerId: frame.activeLayerId || layers[0].id,
    };
  });
  p.activeFrameId ||= p.frames[0].id;
  if (!p.frames.some((f) => f.id === p.activeFrameId))
    p.activeFrameId = p.frames[0].id;
  p.palette =
    Array.isArray(p.palette) && p.palette.length ? p.palette : DEFAULT_PALETTE;
  p.godot = {
    ...{
      asset: "pixel_asset",
      animation: "idle_w",
      direction: "W",
      fps: 6,
      loop: true,
    },
    ...(p.godot || {}),
  };
  p.background = {
    mode: p.background?.mode === "color" ? "color" : "transparent",
    color: isHex(p.background?.color)
      ? p.background.color.toLowerCase()
      : "#0f172a",
  };
  p.quality = p.quality || {};
  return p;
}
function activeFrameOf(project) {
  return (
    project.frames.find((f) => f.id === project.activeFrameId) ||
    project.frames[0]
  );
}
function activeFrameIndex(project) {
  return Math.max(
    0,
    project.frames.findIndex((f) => f.id === project.activeFrameId),
  );
}
function activeLayerIndexOf(frame) {
  return Math.max(
    0,
    frame.layers.findIndex((l) => l.id === frame.activeLayerId),
  );
}
function activeLayerOf(frame) {
  return frame.layers[activeLayerIndexOf(frame)];
}
function hexToRgba(hex, opacity = 1) {
  const h = String(hex || "#000000").replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}
function floodFillFrame(frame, layerIndex, x, y, color) {
  const layer = frame.layers[layerIndex];
  const target = layer.pixels[idx(x, y)];
  if (target === color) return;
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
    const i = idx(cx, cy);
    if (layer.pixels[i] !== target) continue;
    layer.pixels[i] = color;
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function colorsUsed(project) {
  const map = new Map();
  project.frames.forEach((frame) =>
    frame.layers.forEach((layer) =>
      layer.pixels.forEach((px) => {
        if (px) map.set(px, (map.get(px) || 0) + 1);
      }),
    ),
  );
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
function fillBackground(ctx, background, scale = 1) {
  if (background?.mode !== "color") return;
  ctx.fillStyle = isHex(background.color) ? background.color : "#0f172a";
  ctx.fillRect(0, 0, SIZE * scale, SIZE * scale);
}
function compositeFrame(frame, background = { mode: "transparent" }) {
  const out = document.createElement("canvas");
  out.width = SIZE;
  out.height = SIZE;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  fillBackground(ctx, background, 1);
  frame.layers.forEach((layer) => {
    if (!layer.visible) return;
    layer.pixels.forEach((px, i) => {
      if (!px) return;
      ctx.fillStyle = hexToRgba(px, layer.opacity);
      ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
    });
  });
  return out;
}
function downloadText(filename, text, type = "application/json") {
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function downloadCanvas(filename, canvas) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
function readJsonFile(file) {
  return file.text().then((t) => JSON.parse(t));
}
function selectionBounds(sel) {
  if (!sel) return null;
  const x1 = Math.max(0, Math.min(sel.x, sel.x + sel.w));
  const y1 = Math.max(0, Math.min(sel.y, sel.y + sel.h));
  const x2 = Math.min(SIZE - 1, Math.max(sel.x, sel.x + sel.w));
  const y2 = Math.min(SIZE - 1, Math.max(sel.y, sel.y + sel.h));
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}
function getSelectionPixels(layer, sel) {
  const b = selectionBounds(sel);
  if (!b) return null;
  const pixels = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      pixels.push(layer.pixels[idx(b.x + x, b.y + y)]);
  return { ...b, pixels };
}
function pastePixels(layer, clip, targetX, targetY, eraseSource = false) {
  if (!clip) return;
  if (eraseSource) {
    for (let y = 0; y < clip.h; y++)
      for (let x = 0; x < clip.w; x++) {
        const sx = clip.x + x,
          sy = clip.y + y;
        if (sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE)
          layer.pixels[idx(sx, sy)] = null;
      }
  }
  for (let y = 0; y < clip.h; y++)
    for (let x = 0; x < clip.w; x++) {
      const tx = targetX + x,
        ty = targetY + y;
      if (tx >= 0 && ty >= 0 && tx < SIZE && ty < SIZE)
        layer.pixels[idx(tx, ty)] = clip.pixels[y * clip.w + x];
    }
}
function countFalseCheckerboard(project) {
  const bad = new Set([
    "#dddddd",
    "#ddd",
    "#cccccc",
    "#ccc",
    "#ffffff",
    "#f5f5f5",
    "#eeeeee",
    "#999999",
    "#9ca3af",
  ]);
  let count = 0;
  project.frames.forEach((frame) =>
    frame.layers.forEach((layer) =>
      layer.pixels.forEach((px) => {
        if (px && bad.has(String(px).toLowerCase())) count++;
      }),
    ),
  );
  return count;
}
function objectBounds(project) {
  let minX = SIZE,
    minY = SIZE,
    maxX = -1,
    maxY = -1,
    pixels = 0;
  project.frames.forEach((frame) =>
    frame.layers.forEach((layer) => {
      if (!layer.visible) return;
      layer.pixels.forEach((px, i) => {
        if (!px) return;
        const x = i % SIZE,
          y = Math.floor(i / SIZE);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixels++;
      });
    }),
  );
  if (!pixels) return null;
  const w = maxX - minX + 1,
    h = maxY - minY + 1,
    cx = minX + (w - 1) / 2,
    cy = minY + (h - 1) / 2;
  return {
    x: minX,
    y: minY,
    w,
    h,
    pixels,
    centerOffsetX: Math.round(cx - (SIZE - 1) / 2),
    centerOffsetY: Math.round(cy - (SIZE - 1) / 2),
  };
}
function qualityReport(project, maxColors = 32) {
  const used = colorsUsed(project);
  const opaqueBg = project.frames.some((frame) =>
    frame.layers.some((layer) => layer.pixels.every(Boolean)),
  );
  const bounds = objectBounds(project);
  const warnings = [];
  if (!bounds) warnings.push("vazio");
  if (used.length > maxColors) warnings.push("muitas cores");
  if (countFalseCheckerboard(project)) warnings.push("quadriculado falso");
  if (opaqueBg) warnings.push("fundo opaco");
  if (bounds) {
    if (bounds.w < 24 || bounds.h < 24) warnings.push("objeto pequeno");
    if (bounds.w > SIZE - 16 || bounds.h > SIZE - 16)
      warnings.push("objeto grande");
    if (Math.abs(bounds.centerOffsetX) > 14 || Math.abs(bounds.centerOffsetY) > 14)
      warnings.push("fora do centro");
  }
  return {
    colors: used.length,
    overLimit: used.length > maxColors,
    maxColors,
    falseCheckerboardPixels: countFalseCheckerboard(project),
    hasFullOpaqueLayer: opaqueBg,
    transparentOk: !opaqueBg,
    frames: project.frames.length,
    layers: project.frames.reduce((acc, f) => acc + f.layers.length, 0),
    background: project.background,
    bounds,
    warnings,
  };
}
function generateHeuristicProject(prompt, baseProject) {
  const lower = String(prompt || "").toLowerCase();
  const isWalk = /walk|andar|movimento|correr/.test(lower);
  const isAttack = /attack|ataque|golpe/.test(lower);
  const frameCount = isAttack ? 6 : isWalk ? 8 : 4;
  const direction =
    lower.includes("oeste") || lower.includes(" west") || lower.includes(" w ")
      ? "W"
      : lower.includes("leste") || lower.includes("east")
        ? "E"
        : "S";
  const anim = isAttack
    ? `attack_${direction.toLowerCase()}`
    : isWalk
      ? `walk_${direction.toLowerCase()}`
      : `idle_${direction.toLowerCase()}`;
  const project = normalizeProject(baseProject || {});
  project.frames = [];
  project.activeFrameId = null;
  project.godot = {
    ...project.godot,
    animation: anim,
    direction,
    fps: isAttack ? 10 : isWalk ? 8 : 6,
  };
  const colors = {
    outline: "#111827",
    cloth: "#374151",
    leather: "#78350f",
    skin: "#d6a878",
    metal: "#9ca3af",
    shadow: "#1f2937",
    highlight: "#facc15",
  };
  for (let f = 0; f < frameCount; f++) {
    const frame = blankFrame(`Frame ${f + 1}`);
    frame.layers = [
      blankLayer("Silhueta"),
      blankLayer("Detalhes"),
      blankLayer("Sombra/Luz"),
    ];
    frame.activeLayerId = frame.layers[1].id;
    const bob = Math.round(Math.sin((f / frameCount) * Math.PI * 2) * 2);
    const swing = isAttack
      ? f * 4
      : Math.round(Math.sin((f / frameCount) * Math.PI * 2) * 3);
    const step = isWalk
      ? Math.round(Math.sin((f / frameCount) * Math.PI * 2) * 5)
      : 0;
    const cx = 128,
      cy = 128 + bob;
    const faceLeft = direction === "W";
    const lx = faceLeft ? -1 : 1;
    const drawRect = (layer, x, y, w, h, c) => {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE)
            layer.pixels[idx(xx, yy)] = c;
    };
    const drawEllipse = (layer, x, y, rx, ry, c) => {
      for (let yy = -ry; yy <= ry; yy++)
        for (let xx = -rx; xx <= rx; xx++)
          if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) {
            const px = x + xx,
              py = y + yy;
            if (px >= 0 && py >= 0 && px < SIZE && py < SIZE)
              layer.pixels[idx(px, py)] = c;
          }
    };
    const body = frame.layers[0],
      detail = frame.layers[1],
      shade = frame.layers[2];
    drawEllipse(body, cx, cy - 48, 18, 21, colors.outline);
    drawRect(body, cx - 20, cy - 28, 40, 54, colors.outline);
    drawRect(body, cx - 16, cy - 25, 32, 50, colors.cloth);
    drawEllipse(detail, cx + lx * 6, cy - 50, 11, 13, colors.skin);
    drawRect(detail, cx - 18, cy - 21, 36, 8, colors.leather);
    drawRect(detail, cx + lx * 18, cy - 18, 10, 32, colors.leather);
    drawRect(detail, cx - lx * 25, cy - 18, 9, 29, colors.leather);
    drawRect(detail, cx - 16 + step, cy + 26, 10, 30, colors.leather);
    drawRect(detail, cx + 6 - step, cy + 26, 10, 30, colors.leather);
    drawRect(shade, cx - 18, cy + 12, 36, 7, colors.shadow);
    drawRect(shade, cx + lx * 2, cy - 63, 12, 5, colors.highlight);
    if (isAttack) {
      drawRect(
        detail,
        cx + lx * (28 + swing),
        cy - 24 - swing,
        35,
        5,
        colors.metal,
      );
      drawRect(
        detail,
        cx + lx * (62 + swing),
        cy - 27 - swing,
        8,
        11,
        colors.metal,
      );
    } else {
      drawRect(detail, cx + lx * 30, cy - 30, 5, 45, colors.metal);
      drawRect(detail, cx + lx * 27, cy + 10, 12, 18, colors.metal);
    }
    project.frames.push(frame);
    if (!project.activeFrameId) project.activeFrameId = frame.id;
  }
  project.palette = [
    ...new Set([...Object.values(colors), ...DEFAULT_PALETTE]),
  ];
  return project;
}

function App() {
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const drawingRef = useRef(false);
  const lastBridgeSave = useRef(0);
  const [project, setProject] = useState(() =>
    normalizeProject(
      JSON.parse(localStorage.getItem("pixel-project") || "null"),
    ),
  );
  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#111827");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showGrid, setShowGrid] = useState(true);
  const [gridMode, setGridMode] = useState("auto");
  const [gridStep, setGridStep] = useState(1);
  const [gridOpacity, setGridOpacity] = useState(14);
  const [gridMajorStep, setGridMajorStep] = useState(16);
  const [showOnion, setShowOnion] = useState(true);
  const [history, setHistory] = useState([]);
  const [redo, setRedo] = useState([]);
  const [selection, setSelection] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [prompt, setPrompt] = useState("crie personagem idle oeste");
  const [aiOperation, setAiOperation] = useState("generate");
  const [bridgeStatus, setBridgeStatus] = useState("offline");
  const [gallery, setGallery] = useState([]);
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
        ? gridStepForZoom(zoom)
        : clamp(Number(gridStep) || 1, 1, 64),
    [gridMode, gridStep, zoom],
  );
  const checkerSize = Math.max(8, Math.min(32, zoom * 4));

  useEffect(() => {
    renderCanvas();
  }, [
    project,
    zoom,
    showGrid,
    showOnion,
    selection,
    gridMode,
    gridStep,
    gridOpacity,
    gridMajorStep,
    effectiveGridStep,
  ]);
  useEffect(() => {
    localStorage.setItem("pixel-project", JSON.stringify(project));
  }, [project]);
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
    let es;
    try {
      es = new EventSource(`${BRIDGE_URL}/api/events`);
      es.onopen = () => setBridgeStatus("online");
      es.onerror = () => setBridgeStatus("offline");
      es.addEventListener("project", (e) => {
        try {
          const data = normalizeProject(JSON.parse(e.data));
          setProject(data);
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
  function updateProject(mutator, saveHist = true) {
    if (saveHist) pushHistory();
    setProject((p) => {
      const n = cloneProject(p);
      mutator(n);
      return normalizeProject(n);
    });
  }
  function undo() {
    if (!history.length) return;
    setRedo((r) => [cloneProject(project), ...r]);
    setProject(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }
  function redoAction() {
    if (!redo.length) return;
    setHistory((h) => [...h, cloneProject(project)]);
    setProject(redo[0]);
    setRedo((r) => r.slice(1));
  }

  function drawFrame(ctx, frameToDraw, scale = zoom, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    for (const layer of frameToDraw.layers) {
      if (!layer.visible) continue;
      for (let i = 0; i < layer.pixels.length; i++) {
        const px = layer.pixels[i];
        if (!px) continue;
        const x = i % SIZE,
          y = Math.floor(i / SIZE);
        ctx.fillStyle = hexToRgba(px, layer.opacity);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    ctx.restore();
  }
  function drawDynamicGrid(ctx) {
    if (!showGrid) return;
    const step = clamp(Number(effectiveGridStep) || 1, 1, SIZE);
    const opacity = clamp(Number(gridOpacity) || 0, 0, 60) / 100;
    if (!opacity || step * zoom < 2) return;
    const minor = `rgba(148, 163, 184, ${opacity})`;
    const major = `rgba(226, 232, 240, ${Math.min(0.45, opacity * 1.75)})`;
    const drawLines = (spacing, strokeStyle) => {
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
    ctx.clearRect(0, 0, c.width, c.height);
    fillBackground(ctx, project.background, scale);
    drawFrame(ctx, project.frames[previewFrame] || project.frames[0], scale, 1);
  }

  function getCell(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) / zoom),
      y: Math.floor((e.clientY - r.top) / zoom),
    };
  }
  function editAt(x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    setProject((p) => {
      const n = cloneProject(p);
      const f = activeFrameOf(n);
      const l = activeLayerOf(f);
      if (tool === "pencil") l.pixels[idx(x, y)] = color;
      if (tool === "eraser") l.pixels[idx(x, y)] = null;
      if (tool === "picker") setColor(l.pixels[idx(x, y)] || color);
      if (tool === "bucket")
        floodFillFrame(f, activeLayerIndexOf(f), x, y, color);
      if (tool === "dither")
        l.pixels[idx(x, y)] = (x + y) % 2 === 0 ? color : null;
      return normalizeProject(n);
    });
  }
  function onMouseDown(e) {
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
  function onMouseMove(e) {
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
  function removeLayer(id) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      if (f.layers.length === 1) return;
      f.layers = f.layers.filter((l) => l.id !== id);
      f.activeLayerId = f.layers[0].id;
    });
  }
  function moveLayer(i, dir) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      const j = i + dir;
      if (j < 0 || j >= f.layers.length) return;
      [f.layers[i], f.layers[j]] = [f.layers[j], f.layers[i]];
    });
  }
  function updateLayer(i, mutator) {
    updateProject((p) => {
      const f = activeFrameOf(p);
      mutator(f.layers[i]);
    }, false);
  }
  function setGodotField(k, v) {
    updateProject((p) => {
      p.godot = { ...p.godot, [k]: v };
    }, false);
  }
  function setBackgroundField(k, v) {
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
  function removeFrame(id) {
    updateProject((p) => {
      if (p.frames.length === 1) return;
      p.frames = p.frames.filter((f) => f.id !== id);
      p.activeFrameId = p.frames[0].id;
    });
  }
  function moveFrame(i, dir) {
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
  function moveSelection(dx, dy) {
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
  function transformSelection(kind) {
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
    updateProject((p) =>
      p.frames.forEach((f) =>
        f.layers.forEach((l) => {
          l.pixels = l.pixels.map((px) =>
            String(px).toLowerCase() === replaceFrom.toLowerCase()
              ? replaceTo
              : px,
          );
        }),
      ),
    );
  }
  function limitColorsNow() {
    const allowed = usedColors.slice(0, maxColors).map(([c]) => c);
    if (!allowed.length) return;
    updateProject((p) =>
      p.frames.forEach((f) =>
        f.layers.forEach((l) => {
          l.pixels = l.pixels.map((px) =>
            px && !allowed.includes(px) ? allowed[0] : px,
          );
        }),
      ),
    );
  }
  function importPalette(e) {
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
  function loadJson(e) {
    const f = e.target.files[0];
    if (!f) return;
    readJsonFile(f).then((json) => {
      pushHistory();
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
    const frames = Object.fromEntries(
      project.frames.map((f, i) => [
        `${anim}_${String(i).padStart(2, "0")}`,
        {
          frame: { x: i * SIZE, y: 0, w: SIZE, h: SIZE },
          duration: f.duration || Math.round(1000 / project.godot.fps),
        },
      ]),
    );
    downloadText(
      `${asset}_${anim}.atlas.json`,
      JSON.stringify(
        {
          meta: {
            image: `${asset}_${anim}_sheet.png`,
            size: { w: SIZE * project.frames.length, h: SIZE },
            scale: 1,
          },
          frames,
        },
        null,
        2,
      ),
    );
  }
  function exportGodotJson() {
    const asset = slug(project.godot.asset),
      anim = slug(project.godot.animation);
    const metadata = {
      asset,
      engine: "godot",
      godot_version: "4.x",
      frame_width: SIZE,
      frame_height: SIZE,
      background: project.background,
      import: {
        filter: false,
        mipmaps: false,
        repeat: "disabled",
        compression: "lossless",
        texture_type: "2D",
      },
      files: {
        spritesheet: `res://assets/${asset}/spritesheets/${asset}_${anim}_sheet.png`,
        atlas: `res://assets/${asset}/metadata/${asset}_${anim}.atlas.json`,
      },
      animations: [
        {
          name: anim,
          direction: project.godot.direction,
          fps: Number(project.godot.fps),
          loop: Boolean(project.godot.loop),
          frames: project.frames.length,
          layout: "horizontal",
          frame_rects: project.frames.map((_, i) => ({
            x: i * SIZE,
            y: 0,
            w: SIZE,
            h: SIZE,
          })),
        },
      ],
    };
    downloadText(`${asset}.animations.json`, JSON.stringify(metadata, null, 2));
  }
  function exportUnityJson() {
    const asset = slug(project.godot.asset),
      anim = slug(project.godot.animation);
    const metadata = {
      asset,
      engine: "unity",
      background: project.background,
      pixelsPerUnit: SIZE,
      filterMode: "Point",
      compression: "None",
      spriteMode: "Multiple",
      sheet: `${asset}_${anim}_sheet.png`,
      frames: project.frames.map((_, i) => ({
        name: `${anim}_${i}`,
        x: i * SIZE,
        y: 0,
        width: SIZE,
        height: SIZE,
        pivot: { x: 0.5, y: 0.5 },
      })),
    };
    downloadText(
      `${asset}_${anim}.unity.json`,
      JSON.stringify(metadata, null, 2),
    );
  }
  function saveJson() {
    downloadText("pixel-project.json", JSON.stringify(project, null, 2));
  }
  async function saveBackend() {
    try {
      await fetch(`${BRIDGE_URL}/api/project`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(project),
      });
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
        setProject(normalizeProject(await r.json()));
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
  async function loadGalleryItem(id) {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/gallery/${id}`);
      if (r.ok) {
        pushHistory();
        setProject(normalizeProject(await r.json()));
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
          selection,
        }),
      });
      if (!r.ok) throw new Error("bridge off");
      setProject(normalizeProject(await r.json()));
      setBridgeStatus("prompt");
      setTimeout(() => setBridgeStatus("online"), 700);
    } catch {
      setProject(
        aiOperation === "generate"
          ? generateHeuristicProject(prompt, project)
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
          <div className="status">
            Grade: {effectiveGridStep}px · tela: {effectiveGridStep * zoom}px
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
                setProject((p) => ({ ...p, activeFrameId: fr.id }))
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
