import { clamp, normalizeBoxKind, SIZE } from "../../shared/pixel-core.ts";
import type { BoxKind, Frame } from "../../shared/pixel-core.ts";

type GameDataPanelProps = {
  frame: Frame;
  showGameData: boolean;
  setShowGameData: (show: boolean) => void;
  updateActiveFrame: (mutator: (frame: Frame) => void) => void;
  addFrameBox: (kind: BoxKind) => void;
};

export function GameDataPanel({
  frame,
  showGameData,
  setShowGameData,
  updateActiveFrame,
  addFrameBox,
}: GameDataPanelProps) {
  return (
    <>
      <h2>Game data</h2>
      <div className="game-data">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showGameData}
            onChange={(event) => setShowGameData(event.target.checked)}
          />{" "}
          mostrar pivot e boxes
        </label>
        <div className="two-cols">
          <label>
            Pivot X{" "}
            <input
              type="number"
              min="0"
              max={SIZE - 1}
              value={frame.pivot.x}
              onChange={(event) =>
                updateActiveFrame((draft) => {
                  draft.pivot.x = clamp(+event.target.value || 0, 0, SIZE - 1);
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
              onChange={(event) =>
                updateActiveFrame((draft) => {
                  draft.pivot.y = clamp(+event.target.value || 0, 0, SIZE - 1);
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
        {frame.hitboxes.map((box, index) => (
          <div className="box-row" key={box.id}>
            <select
              value={normalizeBoxKind(box.kind || box.name)}
              onChange={(event) =>
                updateActiveFrame((draft) => {
                  const kind = event.target.value as BoxKind;
                  draft.hitboxes[index].kind = kind;
                  draft.hitboxes[index].name = kind;
                })
              }
            >
              <option value="hitbox">hitbox</option>
              <option value="hurtbox">hurtbox</option>
              <option value="attackbox">attackbox</option>
            </select>
            <input
              value={box.name}
              onChange={(event) =>
                updateActiveFrame((draft) => {
                  draft.hitboxes[index].name = event.target.value;
                  draft.hitboxes[index].kind = normalizeBoxKind(
                    event.target.value,
                  );
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
                onChange={(event) =>
                  updateActiveFrame((draft) => {
                    draft.hitboxes[index][field] = clamp(
                      +event.target.value ||
                        (field === "w" || field === "h" ? 1 : 0),
                      field === "w" || field === "h" ? 1 : 0,
                      SIZE,
                    );
                  })
                }
              />
            ))}
            <button
              onClick={() =>
                updateActiveFrame((draft) => {
                  draft.hitboxes = draft.hitboxes.filter(
                    (item) => item.id !== box.id,
                  );
                })
              }
            >
              x
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
