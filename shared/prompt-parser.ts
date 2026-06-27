import {
  activeAssetOf,
  activeFrameOf,
  layerByName,
  setActiveAnimationFrames,
  syncActiveAnimationMeta,
} from "./animation.ts";
import {
  blankFrame,
  blankLayer,
  DEFAULT_PALETTE,
  expandProject,
  type Direction,
  type Frame,
  type Layer,
  type Pixel,
  type Project,
  type Selection,
} from "./model.ts";
import { colorsUsed } from "./palette.ts";
import { qualityReport } from "./qa.ts";
import {
  drawEllipse,
  drawEllipseOutline,
  drawLine,
  drawRect,
  setPixel,
} from "./raster.ts";
import { centerObject, selectionBounds } from "./selection.ts";

// ─── Animation spec ───────────────────────────────────────────────────────────

function animationSpec(prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const explicitAnimation = lower.match(
    /(?:estado\/anima[cç][aã]o|anima[cç][aã]o|estado)\s*:\s*([^\n\r.;]+)/,
  )?.[1];
  const explicitDirection = lower.match(
    /dire[cç][aã]o\s*:\s*(noroeste|northwest|nw|nordeste|northeast|ne|sudoeste|southwest|sw|sudeste|southeast|se|norte|north|n\b|sul|south|s\b|oeste|west|w\b|leste|east|e\b)/,
  )?.[1];
  const direction: Direction = /^(noroeste|northwest|nw)$/.test(
    explicitDirection || "",
  )
    ? "NW"
    : /^(nordeste|northeast|ne)$/.test(explicitDirection || "")
      ? "NE"
      : /^(sudoeste|southwest|sw)$/.test(explicitDirection || "")
        ? "SW"
        : /^(sudeste|southeast|se)$/.test(explicitDirection || "")
          ? "SE"
          : /^(oeste|west|w)$/.test(explicitDirection || "")
            ? "W"
            : /^(leste|east|e)$/.test(explicitDirection || "")
              ? "E"
              : /^(norte|north|n)$/.test(explicitDirection || "")
                ? "N"
                : /^(sul|south|s)$/.test(explicitDirection || "")
                  ? "S"
                  : lower.includes("noroeste") || lower.includes("northwest")
                    ? "NW"
                    : lower.includes("nordeste") || lower.includes("northeast")
                      ? "NE"
                      : lower.includes("sudoeste") ||
                          lower.includes("southwest")
                        ? "SW"
                        : lower.includes("sudeste") ||
                            lower.includes("southeast")
                          ? "SE"
                          : lower.includes("oeste") || lower.includes("west")
                            ? "W"
                            : lower.includes("leste") || lower.includes("east")
                              ? "E"
                              : lower.includes("norte") ||
                                  lower.includes("north")
                                ? "N"
                                : "S";
  const kind = /morrer|death|dead/.test(explicitAnimation || "")
    ? "death"
    : /skill|habilidade|magia|cast/.test(explicitAnimation || "")
      ? "skill"
      : /esquiva|dodge|dash/.test(explicitAnimation || "")
        ? "dodge"
        : /attack|ataque|golpe|hit/.test(explicitAnimation || "")
          ? "attack"
          : /walk|andar|movimento|move|run|correr/.test(explicitAnimation || "")
            ? "walk"
            : /idle|parado|espera/.test(explicitAnimation || "")
              ? "idle"
              : /morrer|death|dead/.test(lower)
                ? "death"
                : /skill|habilidade|cast/.test(lower)
                  ? "skill"
                  : /esquiva|dodge|dash/.test(lower)
                    ? "dodge"
                    : /attack|ataque|golpe|hit/.test(lower)
                      ? "attack"
                      : /walk|andar|movimento|move|run|correr/.test(lower)
                        ? "walk"
                        : "idle";
  const frames =
    kind === "walk"
      ? 8
      : kind === "attack"
        ? 6
        : kind === "dodge"
          ? 5
          : kind === "skill"
            ? 8
            : kind === "death"
              ? 6
              : 4;
  const fps =
    kind === "attack"
      ? 10
      : kind === "walk"
        ? 8
        : kind === "dodge"
          ? 12
          : kind === "skill"
            ? 9
            : 6;
  return {
    kind,
    direction,
    frames,
    fps,
    animation: `${kind}_${direction.toLowerCase()}`,
  };
}

// ─── Palette helpers ──────────────────────────────────────────────────────────

function paletteForPrompt(prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const base = {
    outline: "#111827",
    cloth: "#374151",
    leather: "#78350f",
    skin: "#d6a878",
    metal: "#9ca3af",
    shadow: "#1f2937",
    highlight: "#facc15",
    magic: "#7c3aed",
  };
  if (/valdren|costa|chuva|sombria|dark|feudal/.test(lower))
    return {
      ...base,
      cloth: "#334155",
      leather: "#713f12",
      metal: "#94a3b8",
      highlight: "#38bdf8",
    };
  if (/orc|monstro|bruto/.test(lower))
    return { ...base, skin: "#166534", cloth: "#3f3f46", highlight: "#84cc16" };
  if (/mago|arcano|magia/.test(lower))
    return {
      ...base,
      cloth: "#312e81",
      magic: "#a855f7",
      highlight: "#c084fc",
    };
  return base;
}

// ─── Object generation ────────────────────────────────────────────────────────

type ObjectKind = "key" | "coin" | "potion" | "sword" | "chest" | "gem";

function objectKindFromPrompt(prompt: string): ObjectKind | null {
  const lower = String(prompt || "").toLowerCase();
  if (/personagem|character|npc|her[oó]i|humano|humanoid/.test(lower))
    return null;
  if (/chave|key/.test(lower)) return "key";
  if (/moeda|coin|token|medalha/.test(lower)) return "coin";
  if (/po[cç][aã]o|potion|frasco|bottle|elixir/.test(lower)) return "potion";
  if (/espada|sword|l[âa]mina|blade/.test(lower)) return "sword";
  if (/ba[uú]|chest|caixa|crate/.test(lower)) return "chest";
  if (/gema|gem|cristal|crystal|joia|jewel/.test(lower)) return "gem";
  if (/objeto|object|item|asset|[ií]cone|icon|pickup|invent[aá]rio/.test(lower))
    return "gem";
  return null;
}

function objectPalette(prompt: string, kind: ObjectKind) {
  const lower = String(prompt || "").toLowerCase();
  if (/prata|silver|a[cç]o|steel|ferro|iron/.test(lower) || kind === "sword")
    return {
      outline: "#172033",
      base: "#94a3b8",
      mid: "#64748b",
      dark: "#334155",
      light: "#e2e8f0",
      accent: "#38bdf8",
    };
  if (/roxo|purple|arcano|magic|m[aá]gic/.test(lower) || kind === "gem")
    return {
      outline: "#241038",
      base: "#7e22ce",
      mid: "#9333ea",
      dark: "#4c1d95",
      light: "#d8b4fe",
      accent: "#22d3ee",
    };
  if (/verde|green|veneno|poison/.test(lower) || kind === "potion")
    return {
      outline: "#133022",
      base: "#16a34a",
      mid: "#22c55e",
      dark: "#166534",
      light: "#bbf7d0",
      accent: "#38bdf8",
    };
  if (kind === "chest")
    return {
      outline: "#2a1704",
      base: "#92400e",
      mid: "#b45309",
      dark: "#451a03",
      light: "#facc15",
      accent: "#fbbf24",
    };
  return {
    outline: "#3b2607",
    base: "#d97706",
    mid: "#f59e0b",
    dark: "#92400e",
    light: "#fde68a",
    accent: "#facc15",
  };
}

import { slug } from "./model.ts";

function objectAssetName(kind: ObjectKind, prompt: string) {
  const lower = String(prompt || "").toLowerCase();
  const material = /prata|silver/.test(lower)
    ? "silver"
    : /a[cç]o|steel|ferro|iron/.test(lower)
      ? "steel"
      : /roxo|purple|arcano|magic|m[aá]gic/.test(lower)
        ? "arcane"
        : /verde|green|veneno|poison/.test(lower)
          ? "green"
          : /dourad|ouro|gold/.test(lower)
            ? "golden"
            : "";
  return slug([material, kind].filter(Boolean).join("_"));
}

function drawDiamond(
  layer: Layer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: Pixel,
) {
  for (let yy = -ry; yy <= ry; yy++) {
    const half = Math.max(0, Math.round(rx * (1 - Math.abs(yy) / ry)));
    drawRect(layer, cx - half, cy + yy, half * 2 + 1, 1, color);
  }
}

function drawObjectTemplate(kind: ObjectKind, layers: Layer[], prompt: string) {
  const c = objectPalette(prompt, kind);
  const [outline, base, shadow, light] = layers;
  if (kind === "key") {
    drawEllipseOutline(outline, 80, 128, 39, 38, 8, c.outline);
    drawRect(outline, 113, 116, 87, 26, c.outline);
    drawRect(outline, 192, 128, 24, 18, c.outline);
    drawRect(outline, 203, 141, 16, 23, c.outline);
    drawRect(outline, 180, 141, 24, 17, c.outline);

    drawEllipseOutline(base, 80, 128, 30, 29, 13, c.mid);
    drawRect(base, 119, 123, 78, 14, c.mid);
    drawRect(base, 195, 131, 15, 12, c.mid);
    drawRect(base, 205, 143, 8, 14, c.base);
    drawRect(base, 183, 143, 15, 9, c.base);

    drawRect(shadow, 73, 148, 29, 8, c.dark);
    drawRect(shadow, 121, 135, 73, 5, c.dark);
    drawRect(shadow, 198, 153, 12, 7, c.dark);
    drawRect(light, 64, 101, 34, 6, c.light);
    drawRect(light, 119, 124, 56, 4, c.light);
    drawLine(light, 58, 133, 78, 112, c.light, 5);
    return;
  }

  if (kind === "coin") {
    drawEllipse(outline, 128, 128, 47, 53, c.outline);
    drawEllipse(base, 128, 128, 38, 44, c.mid);
    drawEllipse(shadow, 134, 138, 26, 31, c.dark);
    drawEllipse(base, 123, 121, 30, 37, c.base);
    drawEllipseOutline(light, 128, 128, 25, 31, 4, c.light);
    drawRect(light, 116, 91, 24, 6, c.light);
    return;
  }

  if (kind === "potion") {
    drawRect(outline, 108, 68, 40, 20, c.outline);
    drawRect(outline, 116, 86, 24, 25, c.outline);
    drawEllipse(outline, 128, 145, 49, 52, c.outline);
    drawRect(base, 114, 72, 28, 11, "#8b5cf6");
    drawRect(base, 121, 88, 14, 27, c.accent);
    drawEllipse(base, 128, 148, 39, 42, c.base);
    drawRect(shadow, 103, 150, 50, 29, c.dark);
    drawEllipse(light, 117, 128, 13, 18, c.light);
    drawRect(light, 120, 92, 10, 24, c.light);
    return;
  }

  if (kind === "sword") {
    drawLine(outline, 78, 180, 174, 84, c.outline, 17);
    drawLine(base, 84, 174, 169, 89, c.base, 9);
    drawLine(light, 91, 166, 164, 93, c.light, 3);
    drawRect(outline, 84, 169, 45, 12, c.outline);
    drawRect(base, 91, 171, 33, 7, c.accent);
    drawLine(outline, 71, 187, 102, 156, c.outline, 14);
    drawLine(shadow, 76, 182, 97, 161, c.dark, 8);
    drawEllipse(base, 70, 189, 10, 10, c.accent);
    return;
  }

  if (kind === "chest") {
    drawRect(outline, 72, 94, 112, 87, c.outline);
    drawRect(outline, 84, 74, 88, 30, c.outline);
    drawRect(base, 81, 105, 94, 66, c.base);
    drawRect(base, 92, 84, 72, 22, c.mid);
    drawRect(shadow, 81, 143, 94, 28, c.dark);
    drawRect(light, 88, 91, 66, 7, c.light);
    drawRect(outline, 123, 111, 15, 52, c.outline);
    drawRect(base, 126, 116, 9, 42, c.accent);
    drawRect(outline, 115, 127, 31, 25, c.outline);
    drawRect(light, 121, 131, 19, 14, c.light);
    return;
  }

  drawDiamond(outline, 128, 127, 47, 62, c.outline);
  drawDiamond(base, 128, 127, 36, 50, c.mid);
  drawDiamond(shadow, 135, 138, 24, 34, c.dark);
  drawDiamond(light, 117, 107, 17, 22, c.light);
  drawLine(light, 107, 130, 128, 77, c.accent, 4);
}

function generateObjectProject(
  prompt: string,
  baseProject: any,
  kind: ObjectKind,
): Project {
  const project = expandProject(baseProject || {});
  const frame = blankFrame(
    kind === "key"
      ? "Chave"
      : kind === "coin"
        ? "Moeda"
        : kind === "potion"
          ? "Pocao"
          : kind === "sword"
            ? "Espada"
            : kind === "chest"
              ? "Bau"
              : "Gema",
  );
  frame.duration = 160;
  frame.layers = [
    blankLayer("Contorno"),
    blankLayer("Base"),
    blankLayer("Sombra"),
    blankLayer("Brilho"),
  ];
  frame.activeLayerId = frame.layers[3].id;
  drawObjectTemplate(kind, frame.layers, prompt);
  project.godot = {
    asset: objectAssetName(kind, prompt),
    animation: "idle",
    direction: "S",
    fps: 6,
    loop: true,
  };
  syncActiveAnimationMeta(project);
  setActiveAnimationFrames(project, [frame]);
  const centered = centerObject(project);
  centered.palette = colorsUsed(centered).map(([color]) => color);
  activeAssetOf(centered).palette = centered.palette;
  centered.quality = qualityReport(centered, 16);
  return expandProject(centered);
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function generatePixelArtFromPrompt(
  prompt: string,
  baseProject?: any,
): Project {
  const objectKind = objectKindFromPrompt(prompt);
  if (objectKind) return generateObjectProject(prompt, baseProject, objectKind);

  const spec = animationSpec(prompt);
  const project = expandProject(baseProject || {});
  project.godot = {
    ...project.godot,
    animation: spec.animation,
    direction: spec.direction,
    fps: spec.fps,
    loop: spec.kind !== "death",
  };
  syncActiveAnimationMeta(project);
  const frames: Frame[] = [];
  const c = paletteForPrompt(prompt);
  for (let i = 0; i < spec.frames; i++) {
    const frame = blankFrame(`Frame ${i + 1}`);
    frame.duration = Math.round(1000 / spec.fps);
    frame.layers = [
      blankLayer("Silhueta"),
      blankLayer("Detalhes"),
      blankLayer("Sombra/Luz"),
    ];
    frame.activeLayerId = frame.layers[1].id;
    const body = frame.layers[0],
      detail = frame.layers[1],
      shade = frame.layers[2];
    const phase = (i / spec.frames) * Math.PI * 2;
    const bob =
      spec.kind === "idle"
        ? Math.round(Math.sin(phase) * 2)
        : Math.round(Math.sin(phase) * 3);
    const step = spec.kind === "walk" ? Math.round(Math.sin(phase) * 5) : 0;
    const swing =
      spec.kind === "attack" ? i * 4 : spec.kind === "dodge" ? i * 5 : 0;
    const lx = ["W", "NW", "SW"].includes(spec.direction) ? -1 : 1;
    const cx = 128 + (spec.kind === "dodge" ? lx * swing : 0);
    const cy = 128 + bob + (spec.kind === "death" ? i * 4 : 0);
    if (spec.kind === "death") {
      drawEllipse(body, cx, cy - 10, 22 + i * 2, 11, c.outline);
      drawRect(detail, cx - 24, cy - 12, 48, 13, c.cloth);
      drawRect(shade, cx - 20, cy, 40, 5, c.shadow);
    } else {
      drawEllipse(body, cx, cy - 48, 18, 21, c.outline);
      drawRect(body, cx - 20, cy - 28, 40, 54, c.outline);
      drawRect(body, cx - 16, cy - 25, 32, 50, c.cloth);
      drawEllipse(detail, cx + lx * 6, cy - 50, 11, 13, c.skin);
      drawRect(detail, cx - 18, cy - 21, 36, 8, c.leather);
      drawRect(detail, cx + lx * 18, cy - 18, 10, 32, c.leather);
      drawRect(detail, cx - lx * 25, cy - 18, 9, 29, c.leather);
      drawRect(detail, cx - 16 + step, cy + 26, 10, 30, c.leather);
      drawRect(detail, cx + 6 - step, cy + 26, 10, 30, c.leather);
      drawRect(shade, cx - 18, cy + 12, 36, 7, c.shadow);
      drawRect(shade, cx + lx * 2, cy - 63, 12, 5, c.highlight);
      if (spec.kind === "attack") {
        drawRect(
          detail,
          cx + lx * (28 + swing),
          cy - 24 - swing,
          35,
          5,
          c.metal,
        );
        drawRect(
          detail,
          cx + lx * (62 + swing),
          cy - 27 - swing,
          8,
          11,
          c.metal,
        );
      } else if (spec.kind === "skill") {
        drawEllipse(
          detail,
          cx + lx * (36 + Math.round(Math.sin(phase) * 4)),
          cy - 28,
          8 + (i % 3),
          8 + (i % 3),
          c.magic,
        );
        drawRect(detail, cx + lx * 30, cy - 30, 5, 45, c.metal);
      } else {
        drawRect(detail, cx + lx * 30, cy - 30, 5, 45, c.metal);
        drawRect(detail, cx + lx * 27, cy + 10, 12, 18, c.metal);
      }
    }
    frames.push(frame);
  }
  setActiveAnimationFrames(project, frames);
  project.palette = [
    ...new Set([...Object.values(c), ...DEFAULT_PALETTE]),
  ].filter(Boolean);
  activeAssetOf(project).palette = project.palette;
  project.quality = qualityReport(project, 32);
  return expandProject(project);
}

export function editSelection(
  projectInput: any,
  prompt: string,
  selection?: Selection | null,
  layerName?: string,
): Project {
  const project = expandProject(projectInput);
  const frame = activeFrameOf(project);
  const layer = layerByName(frame, layerName);
  if (!layer) return project;
  const b = selectionBounds(selection) || { x: 88, y: 72, w: 80, h: 104 };
  const lower = String(prompt || "").toLowerCase();
  const c = paletteForPrompt(prompt);
  if (/limpar|clear|apagar/.test(lower)) {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) setPixel(layer, b.x + x, b.y + y, null);
  } else if (/sombra|shadow/.test(lower)) {
    for (let y = Math.floor(b.h * 0.6); y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        if ((x + y) % 2 === 0) setPixel(layer, b.x + x, b.y + y, c.shadow);
  } else if (/luz|highlight|brilho/.test(lower)) {
    for (let y = 0; y < Math.max(2, Math.floor(b.h * 0.2)); y++)
      for (let x = 0; x < b.w; x++)
        if ((x + y) % 3 === 0) setPixel(layer, b.x + x, b.y + y, c.highlight);
  } else if (/contorno|outline/.test(lower)) {
    drawRect(layer, b.x, b.y, b.w, 1, c.outline);
    drawRect(layer, b.x, b.y + b.h - 1, b.w, 1, c.outline);
    drawRect(layer, b.x, b.y, 1, b.h, c.outline);
    drawRect(layer, b.x + b.w - 1, b.y, 1, b.h, c.outline);
  } else {
    drawEllipse(
      layer,
      b.x + Math.floor(b.w / 2),
      b.y + Math.floor(b.h / 2),
      Math.max(2, Math.floor(b.w / 3)),
      Math.max(2, Math.floor(b.h / 3)),
      c.highlight,
    );
  }
  project.palette = [...new Set([...project.palette, ...Object.values(c)])];
  project.quality = qualityReport(project, 32);
  return project;
}
