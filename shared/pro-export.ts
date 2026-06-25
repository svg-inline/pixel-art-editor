import {
  activeAnimationOf,
  activeAssetOf,
  atlasMetadata,
  compactProject,
  compositeFrameRgba,
  expandPixels,
  expandProject,
  godotMetadata,
  SIZE,
  slug,
  unityMetadata,
  type Project,
} from "./pixel-core.ts";

const encoder = new TextEncoder();

export type ZipFile = {
  name: string;
  data: string | Uint8Array;
};

function bytes(input: string | Uint8Array) {
  return typeof input === "string" ? encoder.encode(input) : input;
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function u16(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value: number) {
  return new Uint8Array([
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  ]);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: dosDate };
}

export function encodeZip(files: ZipFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const stamp = dosDateTime();
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name.replace(/\\/g, "/"));
    const data = bytes(file.data);
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  return concatBytes([
    ...localParts,
    central,
    concatBytes([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(central.length),
      u32(offset),
      u16(0),
    ]),
  ]);
}

function writeAscii(out: number[], value: string) {
  for (let i = 0; i < value.length; i++) out.push(value.charCodeAt(i));
}

function colorKey(r: number, g: number, b: number) {
  return `${r},${g},${b}`;
}

function gifPalette(frames: Uint8Array[]) {
  const colors: number[][] = [[0, 0, 0]];
  const map = new Map<string, number>([[colorKey(0, 0, 0), 0]]);
  for (const rgba of frames) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const key = colorKey(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (map.has(key)) continue;
      if (colors.length >= 256) continue;
      map.set(key, colors.length);
      colors.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
  }
  return { colors, map };
}

function nearestColorIndex(
  map: Map<string, number>,
  colors: number[][],
  r: number,
  g: number,
  b: number,
) {
  const exact = map.get(colorKey(r, g, b));
  if (exact !== undefined) return exact;
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 1; i < colors.length; i++) {
    const c = colors[i];
    const d =
      (c[0] - r) * (c[0] - r) +
      (c[1] - g) * (c[1] - g) +
      (c[2] - b) * (c[2] - b);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function packLzwCodes(indices: number[]) {
  const minCodeSize = 8;
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  let codeSize = minCodeSize + 1;
  let nextCode = end + 1;
  let first = true;
  let sinceClear = 0;
  const writeCode = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(buffer & 255);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  const reset = () => {
    writeCode(clear);
    codeSize = minCodeSize + 1;
    nextCode = end + 1;
    first = true;
    sinceClear = 0;
  };
  reset();
  for (const index of indices) {
    writeCode(index);
    if (first) first = false;
    else {
      nextCode++;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
    }
    sinceClear++;
    if (sinceClear >= 96) reset();
  }
  writeCode(end);
  if (bits > 0) out.push(buffer & 255);
  return out;
}

function gifSubBlocks(data: number[]) {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const block = data.slice(i, i + 255);
    out.push(block.length, ...block);
  }
  out.push(0);
  return out;
}

export function encodeGifRgbaFrames(input: {
  width: number;
  height: number;
  frames: Uint8Array[];
  durations?: number[];
  loop?: boolean;
}) {
  const { colors, map } = gifPalette(input.frames);
  const tableSize = Math.max(2, 1 << Math.ceil(Math.log2(colors.length || 2)));
  const tablePower = Math.log2(tableSize) - 1;
  const out: number[] = [];
  writeAscii(out, "GIF89a");
  out.push(...u16(input.width), ...u16(input.height));
  out.push(0x80 | 0x70 | tablePower, 0, 0);
  for (let i = 0; i < tableSize; i++) {
    const color = colors[i] || [0, 0, 0];
    out.push(color[0], color[1], color[2]);
  }
  if (input.loop !== false) {
    out.push(0x21, 0xff, 0x0b);
    writeAscii(out, "NETSCAPE2.0");
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }
  input.frames.forEach((rgba, frameIndex) => {
    const delay = Math.max(2, Math.round((input.durations?.[frameIndex] || 100) / 10));
    out.push(0x21, 0xf9, 0x04, 0x09, ...u16(delay), 0, 0);
    out.push(0x2c, 0, 0, 0, 0, ...u16(input.width), ...u16(input.height), 0);
    const indices: number[] = [];
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) indices.push(0);
      else
        indices.push(
          nearestColorIndex(map, colors, rgba[i], rgba[i + 1], rgba[i + 2]),
        );
    }
    out.push(8, ...gifSubBlocks(packLzwCodes(indices)));
  });
  out.push(0x3b);
  return new Uint8Array(out);
}

export function encodeGifFromProject(projectInput: unknown) {
  const project = expandProject(projectInput);
  const animation = activeAnimationOf(project);
  return encodeGifRgbaFrames({
    width: SIZE,
    height: SIZE,
    frames: animation.frames.map((frame) =>
      compositeFrameRgba(frame, project.background),
    ),
    durations: animation.frames.map(
      (frame) => frame.duration || Math.round(1000 / animation.fps),
    ),
    loop: animation.loop,
  });
}

export function asepriteJson(projectInput: unknown) {
  const project = expandProject(projectInput);
  const asset = activeAssetOf(project);
  const animation = activeAnimationOf(project);
  const anim = slug(animation.name);
  return {
    frames: Object.fromEntries(
      animation.frames.map((frame, index) => [
        `${anim}_${String(index).padStart(2, "0")}.png`,
        {
          frame: { x: index * SIZE, y: 0, w: SIZE, h: SIZE },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: SIZE, h: SIZE },
          sourceSize: { w: SIZE, h: SIZE },
          duration: frame.duration || Math.round(1000 / animation.fps),
          pivot: frame.pivot,
          hitboxes: frame.hitboxes,
        },
      ]),
    ),
    meta: {
      app: "pixel-art-mcp",
      version: "2.0.0",
      image: `${slug(asset.name)}_${anim}_sheet.png`,
      format: "RGBA8888",
      size: { w: SIZE * animation.frames.length, h: SIZE },
      scale: "1",
      frameTags: [
        {
          name: animation.name,
          from: 0,
          to: Math.max(0, animation.frames.length - 1),
          direction: "forward",
          color: "#000000ff",
          data: {
            gameDirection: animation.direction,
            fps: animation.fps,
            loop: animation.loop,
          },
        },
      ],
      layers: animation.frames[0]?.layers.map((layer, index) => ({
        name: layer.name,
        opacity: Math.round(layer.opacity * 255),
        blendMode: "normal",
        index,
      })),
      pixelArtProject: compactProject(project),
    },
  };
}

export function projectFromAsepriteJson(input: any): Project | null {
  return input?.meta?.pixelArtProject
    ? expandProject(input.meta.pixelArtProject)
    : null;
}

export function tilemapMetadata(projectInput: unknown, tileSize = 16) {
  const project = expandProject(projectInput);
  const animation = activeAnimationOf(project);
  const size = Math.max(1, Math.min(SIZE, Math.round(tileSize)));
  const tiles = new Map<string, number>();
  const frames = animation.frames.map((frame) => {
    const layers = frame.layers.map((layer) => expandPixels(layer.pixels));
    const rows: number[][] = [];
    for (let ty = 0; ty < SIZE; ty += size) {
      const row: number[] = [];
      for (let tx = 0; tx < SIZE; tx += size) {
        const sample: string[] = [];
        for (const pixels of layers) {
          for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
              const px = pixels[(ty + y) * SIZE + (tx + x)] || "";
              sample.push(px);
            }
        }
        const key = sample.join(",");
        if (!tiles.has(key)) tiles.set(key, tiles.size);
        row.push(tiles.get(key) || 0);
      }
      rows.push(row);
    }
    return {
      frameId: frame.id,
      name: frame.name,
      duration: frame.duration,
      tiles: rows,
      pivot: frame.pivot,
      hitboxes: frame.hitboxes,
    };
  });
  return {
    format: "pixel-art-mcp-tilemap-v1",
    tileSize: size,
    columns: SIZE / size,
    rows: SIZE / size,
    tileCount: tiles.size,
    animation: {
      id: animation.id,
      name: animation.name,
      direction: animation.direction,
      fps: animation.fps,
      loop: animation.loop,
    },
    frames,
  };
}

export function professionalMetadataFiles(projectInput: unknown) {
  const project = expandProject(projectInput);
  const asset = slug(project.godot.asset);
  const anim = slug(project.godot.animation);
  return [
    {
      name: "metadata/godot.animations.json",
      data: JSON.stringify(godotMetadata(project), null, 2),
    },
    {
      name: "metadata/atlas.json",
      data: JSON.stringify(atlasMetadata(project), null, 2),
    },
    {
      name: "metadata/unity.json",
      data: JSON.stringify(unityMetadata(project), null, 2),
    },
    {
      name: "metadata/aseprite.json",
      data: JSON.stringify(asepriteJson(project), null, 2),
    },
    {
      name: "metadata/tilemap.json",
      data: JSON.stringify(tilemapMetadata(project), null, 2),
    },
    {
      name: `${asset}_${anim}.gif`,
      data: encodeGifFromProject(project),
    },
  ] satisfies ZipFile[];
}
