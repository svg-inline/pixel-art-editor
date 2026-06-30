import type { ChangeEvent } from "react";
import { DIRECTIONS } from "../../shared/pixel-core.ts";
import type { Project } from "../../shared/pixel-core.ts";

type ExportPanelProps = {
  project: Project;
  activeAsset: Project["assets"][number];
  activeAnimation: Project["assets"][number]["animations"][number];
  setActiveAsset: (id: string) => void;
  setActiveAnimation: (id: string) => void;
  addAsset: () => void;
  addAnimation: (name?: string) => void;
  setAnimationPivot: (axis: "x" | "y", value: number) => void;
  setExportProfileField: (
    engine: "godot" | "unity" | "generic",
    key: "pixelsPerUnit",
    value: number,
  ) => void;
  setGodotField: (
    key: keyof Project["godot"],
    value: Project["godot"][keyof Project["godot"]],
  ) => void;
  exportPng: () => void;
  exportSpritesheet: () => void;
  exportGif: () => void;
  exportWebp: () => void;
  exportZip: () => void;
  exportAsepriteJson: () => void;
  exportTilemapJson: () => void;
  exportAtlasJson: () => void;
  exportGodotJson: () => void;
  exportUnityJson: () => void;
  saveJson: () => void;
  loadJson: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function ExportPanel({
  project,
  activeAsset,
  activeAnimation,
  setActiveAsset,
  setActiveAnimation,
  addAsset,
  addAnimation,
  setAnimationPivot,
  setExportProfileField,
  setGodotField,
  exportPng,
  exportSpritesheet,
  exportGif,
  exportWebp,
  exportZip,
  exportAsepriteJson,
  exportTilemapJson,
  exportAtlasJson,
  exportGodotJson,
  exportUnityJson,
  saveJson,
  loadJson,
}: ExportPanelProps) {
  return (
    <>
      <h2>Godot / Unity</h2>
      <label>
        Asset ativo{" "}
        <select
          value={project.activeAssetId}
          onChange={(event) => setActiveAsset(event.target.value)}
        >
          {project.assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={addAsset}>+ asset (idle/walk/attack)</button>
      <label>
        Animação ativa{" "}
        <select
          value={project.activeAnimationId}
          onChange={(event) => setActiveAnimation(event.target.value)}
        >
          {activeAsset.animations.map((animation) => (
            <option key={animation.id} value={animation.id}>
              {animation.name} · {animation.direction}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-buttons">
        <button onClick={() => addAnimation("idle")}>+ idle</button>
        <button onClick={() => addAnimation("walk")}>+ walk</button>
        <button onClick={() => addAnimation("attack")}>+ attack</button>
      </div>
      <div className="status">
        Modelo: {project.assets.length} asset(s) ·{" "}
        {activeAsset.animations.length} animação(ões) ·{" "}
        {activeAnimation.frames.length} frame(s)
      </div>
      <label>
        Asset{" "}
        <input
          value={project.godot.asset}
          onChange={(event) => setGodotField("asset", event.target.value)}
        />
      </label>
      <label>
        Animação{" "}
        <input
          value={project.godot.animation}
          onChange={(event) => setGodotField("animation", event.target.value)}
        />
      </label>
      <label>
        Direção{" "}
        <select
          value={project.godot.direction}
          onChange={(event) => setGodotField("direction", event.target.value)}
        >
          {DIRECTIONS.map((direction) => (
            <option key={direction}>{direction}</option>
          ))}
        </select>
      </label>
      <div className="two-cols">
        {(["x", "y"] as const).map((axis) => (
          <label key={axis}>
            Pivot padrão {axis.toUpperCase()}{" "}
            <input
              type="number"
              min="0"
              max="255"
              value={activeAnimation.pivot[axis]}
              onChange={(event) =>
                setAnimationPivot(axis, +event.target.value || 0)
              }
            />
          </label>
        ))}
      </div>
      {(["godot", "unity"] as const).map((engine) => {
        const profile = activeAsset.exportProfiles.find(
          (item) => item.engine === engine,
        );
        return (
          <label key={engine}>
            {engine} pixels/unit{" "}
            <input
              type="number"
              min="1"
              value={profile?.pixelsPerUnit || 256}
              onChange={(event) =>
                setExportProfileField(
                  engine,
                  "pixelsPerUnit",
                  +event.target.value || 1,
                )
              }
            />
          </label>
        );
      })}
      <label>
        FPS{" "}
        <input
          type="number"
          min="1"
          max="60"
          value={project.godot.fps}
          onChange={(event) => setGodotField("fps", +event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={project.godot.loop}
          onChange={(event) => setGodotField("loop", event.target.checked)}
        />{" "}
        loop
      </label>
      <button onClick={exportPng}>PNG frame</button>
      <button onClick={exportSpritesheet}>Spritesheet</button>
      <button onClick={exportGif}>GIF</button>
      <button onClick={exportWebp}>WebP sheet</button>
      <button onClick={exportZip}>ZIP pacote</button>
      <button onClick={exportAsepriteJson}>Aseprite JSON</button>
      <button onClick={exportTilemapJson}>Tilemap JSON</button>
      <button onClick={exportAtlasJson}>Atlas JSON</button>
      <button onClick={exportGodotJson}>Godot JSON</button>
      <button onClick={exportUnityJson}>Unity JSON</button>
      <button onClick={saveJson}>Salvar projeto</button>
      <input type="file" accept="application/json" onChange={loadJson} />
    </>
  );
}
