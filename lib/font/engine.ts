import { addKerning } from "./kerning";
import { unicodeNames } from "./unicode-names";
import { readGlyphPath, writeGlyphPath } from "./svg-path";
import type { Font, Path, PathCommand } from "opentype.js";
import type { StyleConfig, GlyphEdits, GlyphEdit } from "./types";
async function openType() {
  const module = await import("opentype.js");
  return typeof module.parse === "function"
    ? module
    : (module as unknown as { default: typeof module }).default;
}
const fonts = new Map<string, Promise<Font>>();
let userSource: Font | null = null;
let userSourceName = "";
/** Optional user-supplied source font (current tab only; never uploaded). */
export async function registerSourceFont(buffer: ArrayBuffer, filename: string) {
  if (buffer.byteLength > 32 * 1024 * 1024) throw Error("源字体不能超过 32 MB");
  const ot = await openType();
  const font = ot.parse(buffer);
  if (!font.glyphs?.length) throw Error("字体文件没有可用轮廓");
  userSource = font;
  userSourceName = filename;
  return { name:filename, glyphs:font.glyphs.length };
}
export function clearSourceFont() { userSource=null;userSourceName=""; }
export function sourceFontName(){return userSourceName;}
export async function coverageFor(characters:string, style:StyleConfig, edits: GlyphEdits={}) {
  const base=await loadBase(style);
  const wanted=Array.from(new Set(characters));
  const missing=wanted.filter(c=>base.charToGlyphIndex(c)===0 && !edits[c]?.path);
  return {wanted:wanted.length,covered:wanted.length-missing.length,missing:missing.join("")};
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export function weightFile(weight: number) {
  return [300, 400, 600, 800].reduce(
    (best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best),
    400,
  );
}
export async function loadBase(style: StyleConfig): Promise<Font> {
  if (userSource) return userSource;
  const id = `${style.base}-${weightFile(style.weight)}`;
  if (!fonts.has(id))
    fonts.set(
      id,
      (async () => {
        const ot = await openType();
        const res = await fetch(`/fonts/${id}.ttf`);
        if (!res.ok) throw new Error("基础字库加载失败，请重试");
        return ot.parse(await res.arrayBuffer());
      })().catch((e) => {
        fonts.delete(id);
        throw e;
      }),
    );
  return fonts.get(id)!;
}
export function transformPath(
  source: Path,
  style: StyleConfig,
  edit?: GlyphEdit,
): Path {
  if (edit?.generatedStyle) {
    const g = edit.generatedStyle;
    style = {
      ...style,
      width: (style.width / g.width) * 100,
      slant: style.slant - g.slant,
      roundness: Math.max(0, style.roundness - g.roundness),
    };
  }
  // Construct without importing a second copy of the runtime.
  const path = new (source.constructor as { new (): Path })();
  const sx = ((style.width / 100) * (edit?.scale ?? 100)) / 100;
  const sy = (edit?.scale ?? 100) / 100;
  const angle = ((edit?.rotate ?? 0) * Math.PI) / 180;
  const skew = Math.tan((style.slant * Math.PI) / 180);
  const point = (x: number, y: number) => {
    const a = (x - 500) * sx,
      b = (y - 350) * sy;
    return {
      x:
        500 +
        a * Math.cos(angle) -
        b * Math.sin(angle) +
        skew * (y - 0) +
        (edit?.x ?? 0),
      y: 350 + a * Math.sin(angle) + b * Math.cos(angle) + (edit?.y ?? 0),
    };
  };
  const commands = source.commands.map((c) => {
    const o = { ...c } as PathCommand & Record<string, number | string>;
    for (const [xk, yk] of [
      ["x", "y"],
      ["x1", "y1"],
      ["x2", "y2"],
    ])
      if (typeof o[xk] === "number" && typeof o[yk] === "number") {
        const p = point(o[xk] as number, o[yk] as number);
        o[xk] = p.x;
        o[yk] = p.y;
      }
    return o as PathCommand;
  });
  // Round line corners using quadratic joins; curved strokes are preserved.
  const amount = (style.roundness / 100) * 23;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i],
      prev = commands[i - 1],
      next = commands[i + 1];
    if (
      amount > 0 &&
      c.type === "L" &&
      prev &&
      "x" in prev &&
      next?.type === "L"
    ) {
      const a = Math.hypot(c.x - prev.x, c.y - prev.y),
        b = Math.hypot(next.x - c.x, next.y - c.y);
      const r = Math.min(amount, a / 3, b / 3);
      if (a > 0 && b > 0) {
        path.lineTo(
          c.x + ((prev.x - c.x) * r) / a,
          c.y + ((prev.y - c.y) * r) / a,
        );
        path.quadraticCurveTo(
          c.x,
          c.y,
          c.x + ((next.x - c.x) * r) / b,
          c.y + ((next.y - c.y) * r) / b,
        );
        continue;
      }
    }
    path.commands.push(c);
  }
  return path;
}
export async function glyphPath(
  character: string,
  style: StyleConfig,
  edits: GlyphEdits = {},
) {
  const ot = await openType();
  const font = await loadBase(style);
  const edit = edits[character];
  const path = edit?.path
    ? readGlyphPath(edit.path, ot.Path)
    : font.charToGlyph(character).path;
  return transformPath(path, style, edit);
}
const EXPORT_EM = 4096;
function fontCoordinates(source: Path): Path {
  const path = new (source.constructor as { new (): Path })();
  path.commands = source.commands.map((command) => {
    const c = { ...command } as PathCommand & Record<string, number | string>;
    for (const key of ["x", "y", "x1", "y1", "x2", "y2"])
      if (typeof c[key] === "number")
        c[key] = Math.round(((c[key] as number) * EXPORT_EM) / 1000);
    return c;
  });
  return path;
}
export async function createFont(
  style: StyleConfig,
  edits: GlyphEdits,
  characters: string,
  name: string,
  onProgress?: (n: number) => void,
) {
  const ot = await openType();
  const base = await loadBase(style);
  const glyphs = [
    new ot.Glyph({
      name: ".notdef",
      advanceWidth: EXPORT_EM,
      path: fontCoordinates(base.glyphs.get(0).path),
    }),
  ];
  let i = 0;
  const chars = [...new Set(Array.from(characters))].filter(
    (c) => base.charToGlyphIndex(c) > 0 || !!edits[c]?.path,
  );
  for (const c of chars) {
    const original = base.charToGlyph(c),
      edit = edits[c];
    const source = edit?.path
      ? readGlyphPath(edit.path, ot.Path)
      : original.path;
    const path = transformPath(source, style, edit);
    const advance = Math.max(
      200,
      Math.round((base.charToGlyphIndex(c) > 0 ? (original.advanceWidth || 1000) : 1000) + style.tracking * 10),
    );
    glyphs.push(
      new ot.Glyph({
        name: `uni${c.codePointAt(0)!.toString(16).toUpperCase()}`,
        unicode: c.codePointAt(0),
        advanceWidth: Math.round((advance * EXPORT_EM) / 1000),
        path: fontCoordinates(path),
      }),
    );
    if (++i % 80 === 0) {
      onProgress?.(Math.round((i / chars.length) * 85));
      await tick();
    }
  }
  const safeName = name.trim().slice(0, 40) || "字坊字体";
  const psId = Array.from(safeName + JSON.stringify(style))
    .reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0)
    .toString(36);
  const font = new ot.Font({
    familyName: safeName,
    postScriptName: "Zifang-" + psId,
    styleName: "Regular",
    unitsPerEm: EXPORT_EM,
    ascender: Math.round((880 * EXPORT_EM) / 1000),
    descender: -Math.round((120 * EXPORT_EM) / 1000),
    glyphs,
    copyright: userSource
      ? "Outlines derived from a user-provided font. Check source license."
      : "Derived from Noto Sans SC / Noto Serif SC. Licensed under SIL Open Font License 1.1.",
    license: userSource ? "Source font license applies" : "SIL Open Font License 1.1",
    licenseURL: userSource ? "" : "https://openfontlicense.org",
    manufacturer: "Zifang Studio",
    designer: "Zifang Studio",
    description:
      userSource ? "Chinese font compiled using user-supplied source outlines. Check source font license." : "Chinese font compiled using OFL Noto outlines; only available glyphs are included. Verify GB2312 coverage report.",
  });
  font.kerningPairs = {};
  for (const pair of [
    "AV",
    "AW",
    "AY",
    "AT",
    "FA",
    "LT",
    "LV",
    "PA",
    "TA",
    "To",
    "Ty",
    "VA",
    "WA",
    "Yo",
  ]) {
    const left = font.charToGlyphIndex(pair[0]),
      right = font.charToGlyphIndex(pair[1]);
    if (left && right)
      font.kerningPairs[`${left},${right}`] = -Math.round(
        (45 * EXPORT_EM) / 1000,
      );
  }
  onProgress?.(90);
  const buffer = addKerning(font.toArrayBuffer(), font.kerningPairs);
  onProgress?.(100);
  return { font, buffer, count: chars.length };
}
export async function asTTF(buffer: ArrayBuffer) {
  const { createFont } = await import("fonteditor-core");
  const f = createFont(buffer, {
    type: "otf",
    compound2simple: true,
    kerning: true,
  });
  const ot = await openType();
  const source = ot.parse(buffer),
    target = f.get();
  const names = source.names as unknown as Record<string, any>;
  for (const k of [
    "fontFamily",
    "fullName",
    "postScriptName",
    "copyright",
    "license",
    "licenseURL",
  ] as const) {
    const value =
      names.windows?.[k]?.en || names.unicode?.[k]?.en || names[k]?.en;
    if (value) target.name[k] = value;
  }
  target.name.fontSubFamily = "Regular";
  return unicodeNames(
    f.write({
      type: "ttf",
      hinting: false,
      kerning: true,
      toBuffer: false,
    }) as ArrayBuffer,
  );
}
export function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function vectorizeDetailed(
  image: string,
  threshold: number = 128,
  maxTolerance = 4,
) {
  const img = new Image();
  img.src = image;
  await img.decode();
  const canvas = document.createElement("canvas");
  const scaleToSource = Math.min(1, 1536 / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scaleToSource));
  canvas.height = Math.max(1, Math.round(img.height * scaleToSource));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { smoothTrace } = await import("./smooth-trace");
  const traced = await smoothTrace(
    ctx.getImageData(0, 0, canvas.width, canvas.height),
    threshold,
    maxTolerance,
  );
  const ot = await openType();
  const path = readGlyphPath(traced.d, ot.Path);
  if (!path.commands.length)
    throw new Error("未检测到有效字形，请使用纯色背景、单个深色字符的图片");
  const box = path.getBoundingBox();
  const scale = Math.min(880 / (box.x2 - box.x1), 820 / (box.y2 - box.y1));
  for (const c of path.commands as (PathCommand &
    Record<string, number | string>)[])
    for (const [xk, yk] of [
      ["x", "y"],
      ["x1", "y1"],
      ["x2", "y2"],
    ])
      if (typeof c[xk] === "number") {
        c[xk] = 500 + ((c[xk] as number) - (box.x1 + box.x2) / 2) * scale;
        c[yk] = 370 - ((c[yk] as number) - (box.y1 + box.y2) / 2) * scale;
      }
  return {
    path: writeGlyphPath(path),
    nodes: traced.nodes,
    fidelity: traced.iou,
    tolerance: traced.tolerance,
  };
}
export async function vectorize(
  image: string,
  threshold = 128,
): Promise<string> {
  return (await vectorizeDetailed(image, threshold)).path;
}
