import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";

type CanvasEditorProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  checkerSize: number;
  panReady: boolean;
  isPanning: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void;
};

export function CanvasEditor({
  canvasRef,
  stageRef,
  checkerSize,
  panReady,
  isPanning,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onWheel,
}: CanvasEditorProps) {
  return (
    <section
      ref={stageRef}
      className={`stage${panReady ? " pan-ready" : ""}${isPanning ? " panning" : ""}`}
      role="region"
      aria-label="Área de edição do sprite"
    >
      <p id="canvas-help" className="visually-hidden">
        Canvas interativo. Use as ferramentas ou atalhos para editar. Segure
        espaço ou o botão do meio e arraste para mover; use a roda para zoom.
      </p>
      <canvas
        ref={canvasRef}
        style={{ "--checker-size": `${checkerSize}px` } as CSSProperties}
        tabIndex={0}
        role="img"
        aria-label="Sprite pixel art editável"
        aria-describedby="canvas-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
    </section>
  );
}
