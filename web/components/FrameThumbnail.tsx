import { useEffect, useRef } from "react";
import type { Frame, ProjectBackground } from "../../shared/pixel-core.ts";
import { renderFrameCached } from "../canvas-renderer.ts";

type FrameThumbnailProps = {
  frame: Frame;
  background: ProjectBackground;
};

export function FrameThumbnail({ frame, background }: FrameThumbnailProps) {
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
    ctx.drawImage(renderFrameCached(frame, background), 0, 0, 48, 48);
  }, [frame, background]);

  return <canvas className="frame-thumb" ref={ref} />;
}
