import { loadBase, vectorizeDetailed } from "./engine";
import { readApiJson } from "./api-response";
import {
  SHEET,
  sheetLayout,
  sheetSlots,
  type SheetSlot,
  type SheetCapacity,
} from "./sheet-layout";
import type { GlyphEdits, StyleConfig } from "./types";
export type SheetCell = {
  character: string;
  image: string;
  warning: string;
  slot: SheetSlot;
  regenerated?: { model: string; prompt: string; createdAt: string };
};
export type GlyphSheet = {
  image: string;
  model: string;
  prompt: string;
  createdAt: string;
  width: number;
  height: number;
  layout?: { columns: number; rows: number; capacity: number };
  cells: SheetCell[];
};
export async function sheetTemplate(
  characters: string[],
  style: StyleConfig,
  capacity: SheetCapacity = 72,
) {
  const layout = sheetLayout(capacity);
  const font = await loadBase(style);
  const canvas = document.createElement("canvas");
  canvas.width = SHEET.width;
  canvas.height = SHEET.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cellWidth = layout.width / layout.columns,
    cellHeight = layout.height / layout.rows;
  const em = Math.min(cellWidth, cellHeight) * 0.78;
  for (const slot of sheetSlots(characters, layout)) {
    const glyph = font.charToGlyph(slot.character);
    const path = glyph.getPath(0, 0, em);
    const b = path.getBoundingBox();
    const x = slot.x * canvas.width + cellWidth / 2 - (b.x1 + b.x2) / 2;
    const y = slot.y * canvas.height + cellHeight / 2 - (b.y1 + b.y2) / 2;
    const p = glyph.getPath(x, y, em);
    p.fill = "#b0b0b0";
    p.draw(ctx);
  }
  return canvas.toDataURL("image/png");
}
export async function sliceSheet(data: {
  image: string;
  slots: SheetSlot[];
  model: string;
  prompt: string;
  createdAt: string;
  layout?: { columns: number; rows: number; capacity: number };
}): Promise<GlyphSheet> {
  const img = new Image();
  img.src = data.image;
  await img.decode();
  if (img.width !== SHEET.width || img.height !== SHEET.height)
    throw Error(
      `服务返回 ${img.width}×${img.height}，未达到请求的 3840×2160，已停止自动切割。`,
    );
  const cells: SheetCell[] = [];
  for (const slot of data.slots) {
    const w = Math.round(slot.width * img.width),
      h = Math.round(slot.height * img.height);
    const cell = document.createElement("canvas");
    cell.width = w;
    cell.height = h;
    const ctx = cell.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(
      img,
      slot.x * img.width,
      slot.y * img.height,
      w,
      h,
      0,
      0,
      w,
      h,
    );
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1,
      ink = 0;
    // Preserve all disconnected radicals and dots; do not select only the largest component.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (
          pixels[i + 3] > 100 &&
          pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 <
            160
        ) {
          ink++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    const warning =
      ink < w * h * 0.003
        ? "空白或墨迹过少，请单字重绘"
        : ink > w * h * 0.6
          ? "墨迹异常，请检查背景"
          : minX < w * 0.025 ||
              minY < h * 0.025 ||
              maxX > w * 0.975 ||
              maxY > h * 0.975
            ? "笔画接近格边，可能跨格或被截断"
            : "";
    const square = document.createElement("canvas");
    square.width = square.height = Math.max(w, h);
    const out = square.getContext("2d")!;
    out.fillStyle = "white";
    out.fillRect(0, 0, square.width, square.height);
    out.drawImage(cell, (square.width - w) / 2, (square.height - h) / 2);
    cells.push({
      character: slot.character,
      image: square.toDataURL("image/png"),
      warning,
      slot,
    });
  }
  return { ...data, width: img.width, height: img.height, cells };
}
export async function generateTestSheets(
  characters: string,
  reference: string,
  style: StyleConfig,
  onProgress: (done: number, total: number) => void,
  capacity: SheetCapacity = 72,
) {
  const chars = [...new Set(Array.from(characters))].filter((c) => c.trim());
  const sheets: GlyphSheet[] = [];
  for (let i = 0; i < chars.length; i += capacity) {
    onProgress(i, chars.length);
    const batch = chars.slice(i, i + capacity);
    const response = await fetch("/api/glyph-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characters: batch,
        capacity,
        image: reference,
        template: await sheetTemplate(batch, style, capacity),
        style,
      }),
    });
    const data = await readApiJson(response, "大图生成");
    if (!response.ok) throw Error(data.error || "大图生成失败");
    sheets.push(await sliceSheet(data));
    onProgress(Math.min(i + capacity, chars.length), chars.length);
  }
  return sheets;
}
export async function applySheets(
  sheets: GlyphSheet[],
  style: StyleConfig,
  existing: GlyphEdits,
  onProgress?: (done: number, total: number, character: string) => void,
  onGlyph?: (edits: GlyphEdits) => void,
) {
  const edits = { ...existing };
  const total = sheets.reduce((n, s) => n + s.cells.length, 0);
  let done = 0;
  for (const sheet of sheets)
    for (const cell of sheet.cells) {
      if (cell.warning) throw Error(`「${cell.character}」${cell.warning}`);
      const source = cell.regenerated || sheet;
      onProgress?.(done, total, cell.character);
      const traced = await vectorizeDetailed(cell.image);
      edits[cell.character] = {
        scale: 100,
        rotate: 0,
        x: 0,
        y: 0,
        version: (existing[cell.character]?.version || 0) + 1,
        path: traced.path,
        traceStats: {
          nodes: traced.nodes,
          fidelity: traced.fidelity,
          tolerance: traced.tolerance,
        },
        sourceImage: cell.image,
        model: source.model,
        prompt: source.prompt,
        createdAt: source.createdAt,
        generatedStyle: style,
        sheetSlot: cell.regenerated ? undefined : cell.slot,
      };
      onGlyph?.({ ...edits });
      onProgress?.(++done, total, cell.character);
    }
  return edits;
}
