import type { StyleConfig } from "./types";
import { loadBase } from "./engine";

/**
 * A neutral structural skeleton, not a style sample.
 * The designer's uploaded image remains the primary visual style reference.
 * Used only by Bailian to prevent missing/incorrect strokes in Chinese glyphs.
 */
export async function glyphStructureTemplate(character: string, style: StyleConfig): Promise<string | undefined> {
  try {
    const font = await loadBase(style);
    if (font.charToGlyphIndex(character) === 0) return undefined;
    const glyph = font.charToGlyph(character);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 512, 512);
    const fontSize = 390;
    const path = glyph.getPath(0, 0, fontSize);
    const bounds = path.getBoundingBox();
    if (![bounds.x1, bounds.y1, bounds.x2, bounds.y2].every(Number.isFinite) ||
        bounds.x2 - bounds.x1 < 1 || bounds.y2 - bounds.y1 < 1)
      return undefined;
    const placed = glyph.getPath(
      256 - (bounds.x1 + bounds.x2) / 2,
      256 - (bounds.y1 + bounds.y2) / 2,
      fontSize,
    );
    placed.fill = "#111";
    placed.draw(ctx);
    return canvas.toDataURL("image/png");
  } catch {
    // Missing base font / unsupported glyph should not prevent generation.
    return undefined;
  }
}
