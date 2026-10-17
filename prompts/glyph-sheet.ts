import {
  sheetLayout,
  sheetSlots,
  type SheetCapacity,
} from "@/lib/font/sheet-layout";
import type { StyleConfig } from "@/lib/font/types";
export function sheetPrompt(
  characters: string[],
  style: StyleConfig,
  capacity: SheetCapacity = 72,
) {
  const layout = sheetLayout(capacity),
    cellWidth = layout.width / layout.columns,
    cellHeight = layout.height / layout.rows;
  const em = Math.round(Math.min(cellWidth, cellHeight) * 0.78),
    margin = Math.floor((Math.min(cellWidth, cellHeight) - em) / 2);
  return `Create a production font glyph contact sheet, exactly ${layout.width}x${layout.height} pixels, ${layout.columns} equal columns and ${layout.rows} equal rows. Keep this exact ${layout.columns}x${layout.rows} grid: do not reflow, merge cells, add outer margins, or change row/column count. Image 1 is ONLY the lettering style reference. Image 2 is ONLY the exact layout and character structure guide. Redraw the guide glyphs in the distinctive style of image 1; do not copy its words. Match its stroke weight, angular rhythm, rounded terminals, proportions, and expressive brush shapes. Requested style parameters: ${JSON.stringify(style)}.
Mandatory row-major cell assignments (1-based): ${sheetSlots(characters, layout)
    .map(
      (s) =>
        `row ${Math.floor(s.index / layout.columns) + 1}, column ${(s.index % layout.columns) + 1}: ONLY “${s.character}” U+${s.character.codePointAt(0)!.toString(16)}`,
    )
    .join("; ")}. Remaining cells must be pure white.
Each cell is ${cellWidth}x${cellHeight}. Center ONE complete glyph in a ${em}x${em} em square inside its cell, with at least ${margin} pixels clear space from every cell boundary. All radicals, dots, and disconnected components belong to the same cell. Preserve the correct Chinese structure and stroke count. Use consistent apparent scale and weight across the sheet. No strokes may cross cell boundaries.
Output solid BLACK glyph silhouettes on pure WHITE. Remove all guide lines, labels, gray guides, cell borders, numbers, and captions. No texture, shadow, gradient, logo, decorative shapes, or extra characters. This sheet will be sliced by fixed cell coordinates and vectorized into a font. Exact placement and complete glyphs are essential.`;
}
