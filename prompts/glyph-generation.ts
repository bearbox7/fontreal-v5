import type { StyleConfig } from "@/lib/font/types";
export function glyphPrompt(
  character: string,
  style: StyleConfig,
  variation = 0,
  instructions = "",
  referenceNote = "",
) {
  return `Create exactly ONE Chinese or Latin glyph: “${character}” (U+${character.codePointAt(0)!.toString(16)}). Preserve its correct, complete stroke structure. Match the lettering style of the attached reference if present. Font style: ${JSON.stringify(style)}. Variation index: ${variation}. Center the single black glyph on a pure white square canvas with generous empty margins. Flat solid ink, no shadow, no gradient, no decorative objects, no caption, no extra characters. Aim for consistent weight, Chinese ideographic em square proportions, baseline and terminals. This is a single glyph for vector tracing into a font. ${referenceNote}${instructions.trim() ? `\nUser correction instructions for this glyph (preserve the target character and output only that glyph): ${instructions.trim()}` : ""}`;
}
