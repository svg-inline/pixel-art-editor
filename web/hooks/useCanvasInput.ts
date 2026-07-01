import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  activeFrameOf,
  activeLayerOf,
  canEditPixel,
  clamp,
  drawEllipse,
  drawLine,
  drawRect,
  expandPixels,
  indexOf,
  lassoSelection,
  magicWandSelection,
  normalizeBoxKind,
  selectionBounds,
  SIZE,
} from "../../shared/pixel-core.ts";
import type { Frame, Project, Selection, BoxKind } from "../../shared/pixel-core.ts";
import type { HistoryCommandName } from "../../shared/history.ts";
import {
  renderFrameCached,
  renderFrameFresh,
  renderCacheStats,
  markLayerDirty,
} from "../canvas-renderer.ts";
import {
  activeLayerIndexOf,
  boundsFromPoints,
  cloneProject,
  fillBackground,
  floodFillFrame,
  isShapeTool,
  symmetryPoints,
} from "../lib/editor-helpers.ts";
import type {
  AiPreviewState,
  Point,
  ShapePreviewState,
  SymmetryMode,
  Tool,
} from "../types.ts";

const idx = indexOf;

function hasBrushPreview(tool: Tool) {
  return tool === "pencil" || tool === "eraser" || tool === "dither";
}

type UseCanvasInputParams = {
  project: Project;
  projectRef: RefObject<Project>;
  frame: Frame;
  frameIndex: number;
  previewFrame: number;
  aiPreview: AiPreviewState | null;
  tool: Tool;
  color: string;
  setColor: (color: string) => void;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  symmetry: SymmetryMode;
  showGrid: boolean;
  showOnion: boolean;
  showNextOnion: boolean;
  onionPrevOpacity: number;
  onionNextOpacity: number;
  showGameData: boolean;
  gridOpacity: number;
  gridMajorStep: number;
  effectiveGridStep: number;
  paintGridCell: boolean;
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  setProject: (project: Project) => void;
  markDirty: () => void;
  commitHistory: (
    before: Project | null,
    after: Project,
    type?: HistoryCommandName,
    params?: Record<string, unknown>,
  ) => void;
  updateProject: (
    mutator: (project: Project) => Project | void,
    saveHist?: boolean,
    historyType?: HistoryCommandName,
    params?: Record<string, unknown>,
  ) => void;
};

export function useCanvasInput({
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
  setZoom,
  symmetry,
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
}: UseCanvasInputParams) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const aiPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const strokeBeforeRef = useRef<Project | null>(null);
  const shapeStartRef = useRef<Point | null>(null);
  const lastCellRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const spaceHeldRef = useRef(false);
  const panRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const lastRenderStatsUpdateRef = useRef(0);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [shapePreview, setShapePreview] =
    useState<ShapePreviewState | null>(null);
  const [lassoPreview, setLassoPreview] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [panReady, setPanReady] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [renderStatsText, setRenderStatsText] = useState("cache frio");
  const checkerSize = Math.max(8, Math.min(32, zoom * 4));

  useEffect(() => {
    scheduleCanvasRender();
  }, [
    project,
    zoom,
    showGrid,
    showOnion,
    selection,
    shapePreview,
    lassoPreview,
    hoverPoint,
    symmetry,
    tool,
    color,
    paintGridCell,
    showGameData,
    gridOpacity,
    gridMajorStep,
    onionPrevOpacity,
    onionNextOpacity,
    showNextOnion,
    effectiveGridStep,
  ]);

  useEffect(() => {
    renderAiPreview();
  }, [aiPreview]);

  useEffect(() => {
    schedulePreviewRender();
  }, [project, previewFrame]);

  useEffect(
    () => () => {
      if (canvasRafRef.current !== null)
        cancelAnimationFrame(canvasRafRef.current);
      if (previewRafRef.current !== null)
        cancelAnimationFrame(previewRafRef.current);
    },
    [],
  );

  useEffect(() => {
    const editable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element?.isContentEditable ||
          element?.tagName === "INPUT" ||
          element?.tagName === "TEXTAREA" ||
          element?.tagName === "SELECT",
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || editable(event.target)) return;
      event.preventDefault();
      spaceHeldRef.current = true;
      setPanReady(true);
    };
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeldRef.current = false;
      setPanReady(false);
      if (!panRef.current) setIsPanning(false);
    };
    const releaseAll = () => {
      spaceHeldRef.current = false;
      panRef.current = null;
      setPanReady(false);
      setIsPanning(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);

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
        const position = i * zoom + 0.5;
        ctx.beginPath();
        ctx.moveTo(position, 0);
        ctx.lineTo(position, SIZE * zoom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, position);
        ctx.lineTo(SIZE * zoom, position);
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
    const bounds = selectionBounds(rect);
    if (!bounds) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, Math.min(2, zoom));
    if (rect.mask?.length) {
      const selected = new Set(rect.mask);
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const pixelIndex of selected) {
        const x = pixelIndex % SIZE;
        const y = Math.floor(pixelIndex / SIZE);
        const left = x * zoom + 0.5;
        const top = y * zoom + 0.5;
        const right = (x + 1) * zoom + 0.5;
        const bottom = (y + 1) * zoom + 0.5;
        if (!selected.has(pixelIndex - 1) || x === 0) {
          ctx.moveTo(left, top);
          ctx.lineTo(left, bottom);
        }
        if (!selected.has(pixelIndex + 1) || x === SIZE - 1) {
          ctx.moveTo(right, top);
          ctx.lineTo(right, bottom);
        }
        if (!selected.has(pixelIndex - SIZE) || y === 0) {
          ctx.moveTo(left, top);
          ctx.lineTo(right, top);
        }
        if (!selected.has(pixelIndex + SIZE) || y === SIZE - 1) {
          ctx.moveTo(left, bottom);
          ctx.lineTo(right, bottom);
        }
      }
      ctx.stroke();
    } else {
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        bounds.x * zoom + 0.5,
        bounds.y * zoom + 0.5,
        bounds.w * zoom,
        bounds.h * zoom,
      );
    }
    ctx.restore();
  }

  function drawLassoOverlay(ctx: CanvasRenderingContext2D) {
    if (!lassoPreview.length) return;
    ctx.save();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    lassoPreview.forEach((point, index) => {
      const x = point.x * zoom + zoom / 2;
      const y = point.y * zoom + zoom / 2;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function brushCellOrigins(point: Point) {
    const cellSize =
      showGrid && paintGridCell ? clamp(effectiveGridStep, 1, SIZE) : 1;
    const origin = {
      x: Math.floor(point.x / cellSize) * cellSize,
      y: Math.floor(point.y / cellSize) * cellSize,
    };
    const origins = [origin];
    if (symmetry === "horizontal" || symmetry === "both")
      origins.push({ x: SIZE - cellSize - origin.x, y: origin.y });
    if (symmetry === "vertical" || symmetry === "both")
      origins.push({ x: origin.x, y: SIZE - cellSize - origin.y });
    if (symmetry === "both")
      origins.push({
        x: SIZE - cellSize - origin.x,
        y: SIZE - cellSize - origin.y,
      });
    return {
      cellSize,
      origins: [
        ...new Map(
          origins.map((item) => [`${item.x}:${item.y}`, item]),
        ).values(),
      ],
    };
  }

  function drawBrushPreview(ctx: CanvasRenderingContext2D) {
    if (
      !hoverPoint ||
      !hasBrushPreview(tool)
    )
      return;
    const { cellSize, origins } = brushCellOrigins(hoverPoint);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tool === "eraser" ? "#fb7185" : "#f8fafc";
    ctx.fillStyle = tool === "eraser" ? "rgba(251,113,133,.22)" : color;
    ctx.globalAlpha = tool === "eraser" ? 1 : 0.38;
    for (const origin of origins) {
      const width = Math.min(cellSize, SIZE - origin.x);
      const height = Math.min(cellSize, SIZE - origin.y);
      ctx.fillRect(origin.x * zoom, origin.y * zoom, width * zoom, height * zoom);
      ctx.strokeRect(
        origin.x * zoom + 0.5,
        origin.y * zoom + 0.5,
        width * zoom,
        height * zoom,
      );
    }
    ctx.restore();
  }

  function drawShapeOverlay(ctx: CanvasRenderingContext2D) {
    if (!shapePreview) return;
    const { tool: previewTool, start, end } = shapePreview;
    const bounds = selectionBounds({
      x: start.x,
      y: start.y,
      w: end.x - start.x,
      h: end.y - start.y,
    });
    if (!bounds) return;
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
        (bounds.x + bounds.w / 2) * zoom,
        (bounds.y + bounds.h / 2) * zoom,
        Math.max(zoom / 2, (bounds.w * zoom) / 2),
        Math.max(zoom / 2, (bounds.h * zoom) / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.strokeRect(
        bounds.x * zoom + 0.5,
        bounds.y * zoom + 0.5,
        bounds.w * zoom,
        bounds.h * zoom,
      );
    }
    ctx.restore();
  }

  function boxColor(kind: BoxKind) {
    if (kind === "hurtbox") return "#38bdf8";
    if (kind === "attackbox") return "#fb7185";
    return "#22c55e";
  }

  function drawGameDataOverlay(ctx: CanvasRenderingContext2D) {
    if (!showGameData) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = `${Math.max(10, zoom * 3)}px Arial`;
    ctx.textBaseline = "top";
    for (const box of frame.hitboxes) {
      const kind = normalizeBoxKind(box.kind || box.name);
      const colorValue = boxColor(kind);
      ctx.strokeStyle = colorValue;
      ctx.fillStyle = colorValue;
      ctx.setLineDash(
        kind === "hurtbox" ? [4, 4] : kind === "attackbox" ? [8, 3] : [],
      );
      ctx.strokeRect(
        box.x * zoom + 0.5,
        box.y * zoom + 0.5,
        box.w * zoom,
        box.h * zoom,
      );
      ctx.setLineDash([]);
      ctx.fillText(box.name || kind, box.x * zoom + 3, box.y * zoom + 3);
    }
    const px = frame.pivot.x * zoom + zoom / 2;
    const py = frame.pivot.y * zoom + zoom / 2;
    ctx.strokeStyle = "#facc15";
    ctx.fillStyle = "#facc15";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px - zoom * 2, py);
    ctx.lineTo(px + zoom * 2, py);
    ctx.moveTo(px, py - zoom * 2);
    ctx.lineTo(px, py + zoom * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, zoom / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = SIZE * zoom;
    const height = SIZE * zoom;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    drawGameDataOverlay(ctx);
    if (selection) drawRectOverlay(ctx, selection, "#60a5fa");
    drawLassoOverlay(ctx);
    drawShapeOverlay(ctx);
    drawBrushPreview(ctx);
    const now = performance.now();
    if (now - lastRenderStatsUpdateRef.current > 1000) {
      lastRenderStatsUpdateRef.current = now;
      const stats = renderCacheStats();
      setRenderStatsText(
        `layers ${stats.layerHits}/${stats.layerMisses} (${stats.layerPartialRenders} parciais) · frames ${stats.frameHits}/${stats.frameMisses} (${stats.framePartialRenders} parciais)`,
      );
    }
  }

  function renderPreview() {
    const canvas = previewRef.current;
    if (!canvas) return;
    const scale = 2;
    if (canvas.width !== SIZE * scale) canvas.width = SIZE * scale;
    if (canvas.height !== SIZE * scale) canvas.height = SIZE * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillBackground(ctx, project.background, scale);
    drawFrame(ctx, project.frames[previewFrame] || project.frames[0], scale, 1);
  }

  function renderAiPreview() {
    const canvas = aiPreviewRef.current;
    if (!canvas) return;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
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

  function getCell(
    event:
      | ReactPointerEvent<HTMLCanvasElement>
      | ReactWheelEvent<HTMLCanvasElement>,
  ): Point {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.floor((event.clientX - rect.left) / zoom),
      y: Math.floor((event.clientY - rect.top) / zoom),
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
      animation.frames.findIndex(
        (item) => item.id === projectNext.activeFrameId,
      ),
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
    const edit = cloneForActiveLayerEdit(projectRef.current);
    const next = edit.project;
    const frameToEdit = edit.frame;
    const layer = edit.layer;
    if (layer.locked) return;
    const cellSize =
      showGrid && paintGridCell ? clamp(effectiveGridStep, 1, SIZE) : 1;
    const { origins } = brushCellOrigins({ x, y });
    let dirtyRect: { x: number; y: number; width: number; height: number } | null = null;
    const addDirtyRect = (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      if (!dirtyRect) {
        dirtyRect = rect;
        return;
      }
      const x1 = Math.min(dirtyRect.x, rect.x);
      const y1 = Math.min(dirtyRect.y, rect.y);
      const x2 = Math.max(
        dirtyRect.x + dirtyRect.width,
        rect.x + rect.width,
      );
      const y2 = Math.max(
        dirtyRect.y + dirtyRect.height,
        rect.y + rect.height,
      );
      dirtyRect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    };
    const paintCells = (valueFn: (x: number, y: number) => string | null) => {
      let changed = false;
      for (const origin of origins) {
        let cellChanged = false;
        for (let yy = origin.y; yy < Math.min(SIZE, origin.y + cellSize); yy++)
          for (let xx = origin.x; xx < Math.min(SIZE, origin.x + cellSize); xx++) {
            const pixelIndex = idx(xx, yy);
            const value = valueFn(xx, yy);
            if (
              layer.pixels[pixelIndex] === value ||
              !canEditPixel(layer, xx, yy, value)
            )
              continue;
            layer.pixels[pixelIndex] = value;
            changed = true;
            cellChanged = true;
          }
        if (cellChanged)
          addDirtyRect({
            x: origin.x,
            y: origin.y,
            width: Math.min(SIZE, origin.x + cellSize) - origin.x,
            height: Math.min(SIZE, origin.y + cellSize) - origin.y,
          });
      }
      return changed;
    };
    if (tool === "pencil") paintCells(() => color);
    if (tool === "eraser") paintCells(() => null);
    if (tool === "bucket") {
      for (const point of symmetryPoints({ x, y }, symmetry)) {
        const filled = floodFillFrame(
          frameToEdit,
          activeLayerIndexOf(frameToEdit),
          point.x,
          point.y,
          color,
        );
        if (filled) addDirtyRect(filled);
      }
    }
    if (tool === "dither")
      paintCells((xx, yy) => ((xx + yy) % 2 === 0 ? color : null));
    if (!dirtyRect) return;
    markDirty();
    markLayerDirty(layer.id, dirtyRect);
    projectRef.current = next;
    setProject(next);
  }

  function applyShapeTool(start: Point, end: Point) {
    const shapeTool = tool;
    const transforms: ((point: Point) => Point)[] = [
      (point) => point,
    ];
    if (symmetry === "horizontal" || symmetry === "both")
      transforms.push((point) => ({ x: SIZE - 1 - point.x, y: point.y }));
    if (symmetry === "vertical" || symmetry === "both")
      transforms.push((point) => ({ x: point.x, y: SIZE - 1 - point.y }));
    if (symmetry === "both")
      transforms.push((point) => ({
        x: SIZE - 1 - point.x,
        y: SIZE - 1 - point.y,
      }));
    updateProject(
      (draft) => {
        const layer = activeLayerOf(activeFrameOf(draft));
        if (layer.locked) return;
        for (const transform of transforms) {
          const transformedStart = transform(start);
          const transformedEnd = transform(end);
          if (shapeTool === "line") {
            drawLine(
              layer,
              transformedStart.x,
              transformedStart.y,
              transformedEnd.x,
              transformedEnd.y,
              color,
              1,
            );
            continue;
          }
          const bounds = boundsFromPoints(transformedStart, transformedEnd);
          if (shapeTool === "rect") {
            drawRect(layer, bounds.x, bounds.y, bounds.w, bounds.h, color);
            continue;
          }
          const rx = Math.max(1, Math.floor(bounds.w / 2));
          const ry = Math.max(1, Math.floor(bounds.h / 2));
          drawEllipse(layer, bounds.x + rx, bounds.y + ry, rx, ry, color);
        }
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

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button === 1 || (event.button === 0 && spaceHeldRef.current)) {
      const stage = stageRef.current;
      if (!stage) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      };
      setIsPanning(true);
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCell(event);
    if (hasBrushPreview(tool)) setHoverPoint(point);
    lastCellRef.current = point;
    if (tool === "wand") {
      setSelection(
        magicWandSelection(expandPixels(activeLayerOf(frame).pixels), point.x, point.y),
      );
      return;
    }
    if (tool === "lasso") {
      lassoPointsRef.current = [point];
      setLassoPreview([point]);
      drawingRef.current = true;
      return;
    }
    if (tool === "select") {
      setSelectionStart(point);
      setSelection({ ...point, w: 0, h: 0 });
      return;
    }
    if (isShapeTool(tool)) {
      shapeStartRef.current = point;
      setShapePreview({ tool, start: point, end: point });
      drawingRef.current = true;
      return;
    }
    if (tool === "picker") {
      editAt(point.x, point.y);
      return;
    }
    strokeBeforeRef.current = cloneProject(projectRef.current);
    drawingRef.current = true;
    editAt(point.x, point.y);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      const stage = stageRef.current;
      if (stage) {
        stage.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
        stage.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
      }
      return;
    }
    const point = getCell(event);
    if (hasBrushPreview(tool))
      setHoverPoint((current) =>
        current?.x === point.x && current.y === point.y ? current : point,
      );
    const previousPoint = lastCellRef.current;
    lastCellRef.current = point;
    if (tool === "lasso" && drawingRef.current && event.buttons === 1) {
      const last = lassoPointsRef.current.at(-1);
      if (last?.x !== point.x || last?.y !== point.y) {
        lassoPointsRef.current = [...lassoPointsRef.current, point];
        setLassoPreview(lassoPointsRef.current);
      }
      return;
    }
    if (tool === "select" && selectionStart) {
      setSelection({
        x: selectionStart.x,
        y: selectionStart.y,
        w: point.x - selectionStart.x,
        h: point.y - selectionStart.y,
      });
      return;
    }
    if (drawingRef.current && isShapeTool(tool) && shapeStartRef.current) {
      setShapePreview({ tool, start: shapeStartRef.current, end: point });
      return;
    }
    if (
      drawingRef.current &&
      event.buttons === 1 &&
      (previousPoint?.x !== point.x || previousPoint?.y !== point.y)
    )
      editAt(point.x, point.y);
  }

  function releasePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
      releasePointer(event);
      return;
    }
    lastCellRef.current = getCell(event);
    if (tool === "lasso" && drawingRef.current) {
      setSelection(lassoSelection(lassoPointsRef.current));
      lassoPointsRef.current = [];
      setLassoPreview([]);
      drawingRef.current = false;
      releasePointer(event);
      return;
    }
    if (drawingRef.current && isShapeTool(tool) && shapeStartRef.current) {
      applyShapeTool(
        shapeStartRef.current,
        lastCellRef.current || shapeStartRef.current,
      );
      shapeStartRef.current = null;
      setShapePreview(null);
      drawingRef.current = false;
      releasePointer(event);
      return;
    }
    if (drawingRef.current) {
      const type =
        tool === "bucket"
          ? "fill_area"
          : tool === "pencil"
            ? "draw_pixel"
            : tool === "eraser"
              ? "erase_pixel"
            : "project.change";
      commitHistory(strokeBeforeRef.current, projectRef.current, type, {
        tool,
        color: tool === "eraser" ? null : color,
      });
      strokeBeforeRef.current = null;
    }
    drawingRef.current = false;
    setSelectionStart(null);
    releasePointer(event);
  }

  function onPointerLeave(event: ReactPointerEvent<HTMLCanvasElement>) {
    setHoverPoint(null);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      drawingRef.current = false;
      setSelectionStart(null);
    }
  }

  function onWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(zoom + direction, 1, 16);
    if (nextZoom === zoom) return;
    const canvasRect = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const pixelX = clamp((event.clientX - canvasRect.left) / zoom, 0, SIZE);
    const pixelY = clamp((event.clientY - canvasRect.top) / zoom, 0, SIZE);
    const viewportX = event.clientX - stageRect.left;
    const viewportY = event.clientY - stageRect.top;
    setZoom(nextZoom);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const updatedCanvas = canvasRef.current;
        const updatedStage = stageRef.current;
        if (!updatedCanvas || !updatedStage) return;
        updatedStage.scrollLeft =
          updatedCanvas.offsetLeft + pixelX * nextZoom - viewportX;
        updatedStage.scrollTop =
          updatedCanvas.offsetTop + pixelY * nextZoom - viewportY;
      }),
    );
  }

  return {
    canvasRef,
    previewRef,
    aiPreviewRef,
    renderStatsText,
    checkerSize,
    canvasHandlers: {
      stageRef,
      panReady,
      isPanning,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave,
      onWheel,
    },
  };
}
