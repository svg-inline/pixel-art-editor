import type { RefObject } from "react";
import { clamp } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";
import { FrameThumbnail } from "./FrameThumbnail.tsx";

type TimelineProps = {
  project: Project;
  previewRef: RefObject<HTMLCanvasElement | null>;
  previewFrame: number;
  activeAnimation: {
    name: string;
    direction: string;
    loop: boolean;
  };
  addFrame: () => void;
  duplicateFrame: () => void;
  moveFrame: (index: number, direction: number) => void;
  removeFrame: (id: string) => void;
  updateProject: (mutator: (project: Project) => Project | void, saveHist?: boolean) => void;
};

export function Timeline({
  project,
  previewRef,
  previewFrame,
  activeAnimation,
  addFrame,
  duplicateFrame,
  moveFrame,
  removeFrame,
  updateProject,
}: TimelineProps) {
  return (
    <>
      <h2>Preview animado</h2>
      <canvas className="preview" ref={previewRef} />
      <div className="status">
        {activeAnimation.name} · {activeAnimation.direction} · frame{" "}
        {Math.min(previewFrame + 1, project.frames.length)}/
        {project.frames.length} · {project.frames[previewFrame]?.durationMs || 0}
        ms
        {activeAnimation.loop ? " · loop" : " · sem loop"}
      </div>
      <div className="timeline">
        <button onClick={addFrame}>+ frame</button>
        <button onClick={duplicateFrame}>duplicar</button>
        {project.frames.map((frame, index) => (
          <div
            key={frame.id}
            className={
              "frame " + (frame.id === project.activeFrameId ? "active" : "")
            }
            onClick={() =>
              updateProject((draft) => {
                draft.activeFrameId = frame.id;
              }, false)
            }
          >
            <FrameThumbnail frame={frame} background={project.background} />
            <span>{index + 1}</span>
            <input
              value={frame.name}
              onChange={(event) =>
                updateProject((draft) => {
                  draft.frames[index].name = event.target.value;
                }, false)
              }
            />
            <input
              type="number"
              min="1"
              max="5000"
              value={frame.durationMs}
              title="Duração em ms"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                updateProject((draft) => {
                  const durationMs = clamp(
                    +event.target.value || 1,
                    1,
                    5000,
                  );
                  draft.frames[index].durationMs = durationMs;
                  draft.frames[index].duration = durationMs;
                })
              }
            />
            <button
              onClick={(event) => {
                event.stopPropagation();
                moveFrame(index, -1);
              }}
            >
              ↑
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                moveFrame(index, 1);
              }}
            >
              ↓
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                removeFrame(frame.id);
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
