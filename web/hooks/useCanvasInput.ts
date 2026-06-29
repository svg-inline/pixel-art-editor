import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import {
  activeFrameOf,
  activeLayerOf,
  clamp,
  drawEllipse,
  drawLine,
  drawRect,
  expandPixels,
  indexOf,
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
} from "../lib/editor-helpers.ts";
import type { AiPreviewState, Point, ShapePreviewState, Tool } from "../types.ts";

const idx = indexOf;

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
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const aiPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const strokeBeforeRef = useRef<Project | null>(null);
  const shapeStartRef = useRef<Point | null>(null);
  const lastCellRef = useRef<Point | null>(null);
  const lastRenderStatsUpdateRef = useRef(0);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [shapePreview, setShapePreview] =
    useState<ShapePreviewState | null>(null);
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
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      bounds.x * zoom + 0.5,
      bounds.y * zoom + 0.5,
      bounds.w * zoom,
      bounds.h * zoom,
    );
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
    drawShapeOverlay(ctx);
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

  function getCell(event: ReactMouseEvent<HTMLCanvasElement>): Point {
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
    const cellSize =
      showGrid && paintGridCell ? clamp(effectiveGridStep, 1, SIZE) : 1;
    const cellX = Math.floor(x / cellSize) * cellSize;
    const cellY = Math.floor(y / cellSize) * cellSize;
    let dirtyRect: { x: number; y: number; width: number; height: number } | null = null;
    const paintCell = (valueFn: (x: number, y: number) => string | null) => {
      let changed = false;
      for (let yy = cellY; yy < Math.min(SIZE, cellY + cellSize); yy++)
        for (let xx = cellX; xx < Math.min(SIZE, cellX + cellSize); xx++) {
          const pixelIndex = idx(xx, yy);
          const value = valueFn(xx, yy);
          if (layer.pixels[pixelIndex] === value) continue;
          layer.pixels[pixelIndex] = value;
          changed = true;
        }
      if (changed) {
        dirtyRect = {
          x: cellX,
          y: cellY,
          width: Math.min(SIZE, cellX + cellSize) - cellX,
          height: Math.min(SIZE, cellY + cellSize) - cellY,
        };
      }
    };
    if (tool === "pencil") paintCell(() => color);
    if (tool === "eraser") paintCell(() => null);
    if (tool === "bucket")
      dirtyRect = floodFillFrame(
        frameToEdit,
        activeLayerIndexOf(frameToEdit),
        x,
        y,
        color,
      );
    if (tool === "dither")
      paintCell((xx, yy) => ((xx + yy) % 2 === 0 ? color : null));
    if (!dirtyRect) return;
    markDirty();
    markLayerDirty(layer.id, dirtyRect);
    projectRef.current = next;
    setProject(next);
  }

  function applyShapeTool(start: Point, end: Point) {
    const shapeTool = tool;
    updateProject(
      (draft) => {
        const layer = activeLayerOf(activeFrameOf(draft));
        if (shapeTool === "line") {
          drawLine(layer, start.x, start.y, end.x, end.y, color, 1);
          return;
        }
        const bounds = boundsFromPoints(start, end);
        if (shapeTool === "rect") {
          drawRect(layer, bounds.x, bounds.y, bounds.w, bounds.h, color);
          return;
        }
        const rx = Math.max(1, Math.floor(bounds.w / 2));
        const ry = Math.max(1, Math.floor(bounds.h / 2));
        drawEllipse(layer, bounds.x + rx, bounds.y + ry, rx, ry, color);
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

  function onMouseDown(event: ReactMouseEvent<HTMLCanvasElement>) {
    const point = getCell(event);
    lastCellRef.current = point;
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
    strokeBeforeRef.current = cloneProject(projectRef.current);
    drawingRef.current = true;
    editAt(point.x, point.y);
  }

  function onMouseMove(event: ReactMouseEvent<HTMLCanvasElement>) {
    const point = getCell(event);
    const previousPoint = lastCellRef.current;
    lastCellRef.current = point;
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

  function onMouseUp(event?: ReactMouseEvent<HTMLCanvasElement>) {
    if (event) lastCellRef.current = getCell(event);
    if (drawingRef.current && isShapeTool(tool) && shapeStartRef.current) {
      applyShapeTool(
        shapeStartRef.current,
        lastCellRef.current || shapeStartRef.current,
      );
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

  return {
    canvasRef,
    previewRef,
    aiPreviewRef,
    renderStatsText,
    checkerSize,
    canvasHandlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave: onMouseUp,
    },
  };
}
