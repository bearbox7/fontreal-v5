/**
 * Extract glyphs already present in a tiled reference image.
 * Unlike diffusion-style image generation, this preserves actual ink shapes.
 *
 * Mapping is explicit and previewed: left-to-right, top-to-bottom, one glyph
 * per tile. We never infer character identity from image pixels.
 */
export type ReferenceGridCell = {
  character: string;
  index: number;
  row: number;
  column: number;
  image: string;
};

export function planReferenceGrid(characters: string, columns: number, rows: number) {
  const glyphs = Array.from(characters).filter((c) => !!c.trim());
  if (!Number.isInteger(columns) || columns < 1 || columns > 24 ||
      !Number.isInteger(rows) || rows < 1 || rows > 24)
    throw Error("请填写 1–24 范围内的参考图列数和行数。");
  if (glyphs.length === 0 || glyphs.length > 72)
    throw Error("请先填写 1–72 个需要从参考图提取的字符。");
  if (new Set(glyphs).size !== glyphs.length)
    throw Error("参考图原样提取需要每个字符只出现一次，请删除测试文字中的重复字。");
  if (glyphs.length !== columns * rows)
    throw Error(`参考图 ${columns} 列 × ${rows} 行应对应 ${columns * rows} 个字，目前填写了 ${glyphs.length} 个。请核对行列数和从左到右的文字顺序。`);
  return glyphs.map((character, index) => ({
    character,
    index,
    row: Math.floor(index / columns),
    column: index % columns,
  }));
}

export type InkBounds = { x: number; y: number; width: number; height: number; ink: number };
export function findGridInkBounds(pixels: Uint8ClampedArray, width: number, height: number): InkBounds | undefined {
  if (pixels.length < width * height * 4 || width < 8 || height < 8) return undefined;
  // Ignore the outer 1.5% as the cell divider is not part of the glyph.
  const left = Math.ceil(width * 0.015);
  const top = Math.ceil(height * 0.015);
  const right = Math.floor(width * 0.985);
  const bottom = Math.floor(height * 0.985);
  let minX = right, maxX = -1, minY = bottom, maxY = -1, ink = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const n = (y * width + x) * 4;
    const a = pixels[n + 3] / 255;
    // Transparency has been composited on white by the canvas.
    const lum = 0.299 * pixels[n] + 0.587 * pixels[n + 1] + 0.114 * pixels[n + 2];
    if (a > 0.5 && lum < 155) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      ink++;
    }
  }
  if (maxX < minX || maxY < minY || ink < width * height * 0.001)
    return undefined;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, ink };
}

function imageCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw Error("浏览器画布不可用，无法提取参考字形。");
  return { canvas, ctx };
}

export async function previewReferenceGrid(
  reference: string,
  characters: string,
  columns: number,
  rows: number,
): Promise<ReferenceGridCell[]> {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(reference))
    throw Error("请先上传 PNG、JPG 或 WEBP 字体参考图。");
  const plan = planReferenceGrid(characters, columns, rows);
  const source = new Image();
  source.src = reference;
  await source.decode();
  if (!source.naturalWidth || !source.naturalHeight ||
      source.naturalWidth / columns < 30 || source.naturalHeight / rows < 30)
    throw Error("参考图片分辨率太低，每个格子的宽高至少应为 30 像素。请上传更清晰的网格图。");
  const prepared: ReferenceGridCell[] = [];
  for (const item of plan) {
    const x1 = Math.round((item.column / columns) * source.naturalWidth);
    const x2 = Math.round(((item.column + 1) / columns) * source.naturalWidth);
    const y1 = Math.round((item.row / rows) * source.naturalHeight);
    const y2 = Math.round(((item.row + 1) / rows) * source.naturalHeight);
    const w = x2 - x1, h = y2 - y1;
    const raw = document.createElement("canvas");
    raw.width = w; raw.height = h;
    const rawCtx = raw.getContext("2d", { willReadFrequently: true });
    if (!rawCtx) throw Error("浏览器画布不可用，无法裁切参考图。");
    rawCtx.fillStyle = "#fff";
    rawCtx.fillRect(0, 0, w, h);
    rawCtx.drawImage(source, x1, y1, w, h, 0, 0, w, h);
    const b = findGridInkBounds(rawCtx.getImageData(0, 0, w, h).data, w, h);
    if (!b) throw Error(`第 ${item.index + 1} 格「${item.character}」没有检测到深色字形，请确认列数、行数和格子位置。`);
    const { canvas, ctx } = imageCanvas(1024);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1024, 1024);
    // Preserve the original glyph's aspect ratio without synthesizing strokes.
    // Center the measured ink bounds, leaving 10%+ of white em margins.
    const scale = Math.min(820 / b.width, 820 / b.height);
    const destWidth = Math.max(1, Math.round(b.width * scale));
    const destHeight = Math.max(1, Math.round(b.height * scale));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raw,
      b.x, b.y, b.width, b.height,
      Math.round((1024 - destWidth) / 2), Math.round((1024 - destHeight) / 2),
      destWidth, destHeight,
    );
    prepared.push({ ...item, image: canvas.toDataURL("image/png") });
  }
  return prepared;
}
