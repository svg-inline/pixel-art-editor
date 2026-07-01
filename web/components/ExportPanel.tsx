import type { ChangeEvent } from "react";
import { DIRECTIONS } from "../../shared/pixel-core.ts";
import type { BoxKind, ExportProfile, Project, qualityReport } from "../../shared/pixel-core.ts";

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
    profileId: string,
    key: keyof ExportProfile,
    value: ExportProfile[keyof ExportProfile],
  ) => void;
  report: ReturnType<typeof qualityReport>;
  qaProfileId: string;
  setQaProfileId: (profileId: string) => void;
  exportQaStatus: { kind: string; blocked: boolean; message: string; mismatchedPixels: number } | null;
  setGodotField: (
    key: keyof Project["godot"],
    value: Project["godot"][keyof Project["godot"]],
  ) => void;
  exportPng: () => void;
  exportSpritesheet: () => void;
  exportGif: () => void;
  exportWebp: () => void;
  exportZip: (preset?: ExportProfile["preset"]) => void;
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
  report,
  qaProfileId,
  setQaProfileId,
  exportQaStatus,
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
  const qaProfile = activeAsset.exportProfiles.find((item) => item.id === qaProfileId || item.preset === qaProfileId) || activeAsset.exportProfiles[0];
  const boxKinds: BoxKind[] = ["hitbox", "hurtbox", "attackbox"];
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
                  profile!.id,
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
      <section className="export-qa" aria-labelledby="export-qa-title">
        <h3 id="export-qa-title">QA antes do export</h3>
        <label>
          Perfil{" "}
          <select value={qaProfile.id} onChange={(event) => setQaProfileId(event.target.value)}>
            {activeAsset.exportProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
        <label>
          Política{" "}
          <select value={qaProfile.qaMode} onChange={(event) => setExportProfileField(qaProfile.id, "qaMode", event.target.value as ExportProfile["qaMode"])}>
            <option value="warning">Avisar e permitir</option>
            <option value="block">Bloquear em erro</option>
          </select>
        </label>
        <label>
          Escopo{" "}
          <select value={qaProfile.scope} onChange={(event) => setExportProfileField(qaProfile.id, "scope", event.target.value as ExportProfile["scope"])}>
            <option value="active_animation">Animação ativa</option>
            <option value="all_animations">Todas as animações</option>
          </select>
        </label>
        <label>
          Fundo{" "}
          <select id="export-background-mode" value={qaProfile.background.mode} onChange={(event) => setExportProfileField(qaProfile.id, "background", { ...qaProfile.background, mode: event.target.value as ExportProfile["background"]["mode"] })}>
            <option value="project">Usar projeto</option>
            <option value="transparent">Transparente</option>
            <option value="color">Cor sólida</option>
          </select>
        </label>
        {qaProfile.background.mode === "color" ? <label>Cor do fundo <input type="color" value={qaProfile.background.color} onChange={(event) => setExportProfileField(qaProfile.id, "background", { ...qaProfile.background, color: event.target.value })} /></label> : null}
        <div className="two-cols">
          <label>Escala inteira <input type="number" min="1" max="16" value={qaProfile.scale} onChange={(event) => setExportProfileField(qaProfile.id, "scale", +event.target.value)} /></label>
          <label>Padding <input type="number" min="0" max="256" value={qaProfile.padding} onChange={(event) => setExportProfileField(qaProfile.id, "padding", +event.target.value)} /></label>
          <label>Spacing <input type="number" min="0" max="256" value={qaProfile.spacing} onChange={(event) => setExportProfileField(qaProfile.id, "spacing", +event.target.value)} /></label>
          <label>Máx. cores <input type="number" min="2" max="256" value={qaProfile.maxColors} onChange={(event) => setExportProfileField(qaProfile.id, "maxColors", +event.target.value)} /></label>
          <label>Margem mín. <input type="number" min="0" max="64" value={qaProfile.minMargin} onChange={(event) => setExportProfileField(qaProfile.id, "minMargin", +event.target.value)} /></label>
          <label>Tolerância centro <input type="number" min="0" max="128" value={qaProfile.centerTolerance} onChange={(event) => setExportProfileField(qaProfile.id, "centerTolerance", +event.target.value)} /></label>
        </div>
        <label><input type="checkbox" checked={qaProfile.trim} onChange={(event) => setExportProfileField(qaProfile.id, "trim", event.target.checked)} /> trim por conteúdo</label>
        <label><input type="checkbox" checked={qaProfile.crop !== null} onChange={(event) => setExportProfileField(qaProfile.id, "crop", event.target.checked ? { x: 0, y: 0, w: 256, h: 256 } : null)} /> crop personalizado</label>
        {qaProfile.crop ? <div className="two-cols">
          {(["x", "y", "w", "h"] as const).map((key) => <label key={key}>Crop {key.toUpperCase()} <input type="number" min={key === "w" || key === "h" ? 1 : 0} max="256" value={qaProfile.crop![key]} onChange={(event) => setExportProfileField(qaProfile.id, "crop", { ...qaProfile.crop!, [key]: +event.target.value })} /></label>)}
        </div> : null}
        <fieldset>
          <legend>Direções (nenhuma = todas)</legend>
          {DIRECTIONS.map((direction) => <label key={direction}><input type="checkbox" checked={qaProfile.directions.includes(direction)} onChange={(event) => setExportProfileField(qaProfile.id, "directions", event.target.checked ? [...qaProfile.directions, direction] : qaProfile.directions.filter((item) => item !== direction))} /> {direction}</label>)}
        </fieldset>
        <label><input type="checkbox" checked={qaProfile.binaryAlpha} onChange={(event) => setExportProfileField(qaProfile.id, "binaryAlpha", event.target.checked)} /> exigir alpha binário</label>
        <label><input type="checkbox" checked={qaProfile.requirePivot} onChange={(event) => setExportProfileField(qaProfile.id, "requirePivot", event.target.checked)} /> exigir pivot confirmado</label>
        <fieldset>
          <legend>Caixas obrigatórias por frame</legend>
          {boxKinds.map((kind) => (
            <label key={kind}><input type="checkbox" checked={qaProfile.requiredBoxes.includes(kind)} onChange={(event) => setExportProfileField(qaProfile.id, "requiredBoxes", event.target.checked ? [...qaProfile.requiredBoxes, kind] : qaProfile.requiredBoxes.filter((item) => item !== kind))} /> {kind}</label>
          ))}
        </fieldset>
        <div className={`qa-summary ${report.errors.length ? "has-errors" : report.issues.length ? "has-warnings" : "is-ok"}`} role="status">
          <strong>{report.errors.length} erro(s) · {report.warningsDetailed.length} aviso(s)</strong>
          <span> · {report.assetFrames} frame(s) · até {report.colors} cor(es)</span>
          <br />Transparência real: {report.hasRealTransparency ? "sim" : "não"} · alpha parcial: {report.partialAlphaPixels}
          {report.issues.length ? (
            <ul>{report.issues.slice(0, 12).map((issue, index) => <li key={`${issue.frameId}-${issue.code}-${index}`}><b>{issue.severity}</b> · {issue.frameName}: {issue.title} — {issue.detail}</li>)}</ul>
          ) : <p>Nenhum problema técnico detectado.</p>}
        </div>
        {exportQaStatus ? <p className={exportQaStatus.blocked ? "export-status blocked" : "export-status passed"}>{exportQaStatus.kind}: {exportQaStatus.message}</p> : null}
      </section>
      <button onClick={exportPng}>PNG frame</button>
      <button onClick={exportSpritesheet}>Spritesheet</button>
      <button onClick={exportGif}>GIF</button>
      <button onClick={exportWebp}>WebP sheet</button>
      <button onClick={() => exportZip(qaProfile.preset)}>ZIP pacote ({qaProfile.name})</button>
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
