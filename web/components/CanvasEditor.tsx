import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";

type CanvasEditorProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  checkerSize: number;
  onMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (event?: ReactMouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: (event?: ReactMouseEvent<HTMLCanvasElement>) => void;
};

export function CanvasEditor({
  canvasRef,
  checkerSize,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: CanvasEditorProps) {
  return (
    <section className="stage">
      <canvas
        ref={canvasRef}
        style={{ "--checker-size": `${checkerSize}px` } as CSSProperties}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
    </section>
  );
}
