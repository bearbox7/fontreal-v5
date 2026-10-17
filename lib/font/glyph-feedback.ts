import { z } from "zod";
export const feedbackSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  text: z.string().trim().min(1).max(500),
});
export const feedbackListSchema = z.array(feedbackSchema).max(8);
export type GlyphFeedback = z.infer<typeof feedbackSchema>;
export function feedbackInstructions(points: GlyphFeedback[]) {
  if (!points.length) return "";
  return `\nLOCAL CORRECTIONS: The LAST attached image is the current glyph with numbered orange location markers, not a font style reference. Coordinates below use the full square image, origin top-left, x rightward, y downward. Match each comment to its numbered marker. Prioritize changes around these positions; preserve the rest of the glyph, complete correct strokes, overall proportions and style as closely as possible. Remove all marker circles, numbers and annotations in the output. Return only the corrected single black glyph on white.\n${points.map((p, i) => `Marker ${i + 1} at x=${(p.x * 100).toFixed(1)}%, y=${(p.y * 100).toFixed(1)}%: ${p.text}`).join("\n")}`;
}
