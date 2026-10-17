import { vectorizeDetailed } from "./engine";
import type { StyleConfig, GlyphEdits } from "./types";
import { requestGlyph } from "./glyph-request";
import { runSingleGeneration } from "./single-generation";
import { glyphStructureTemplate } from "./glyph-structure-template";

export async function generateTestGlyphs(
  characters: string,
  reference: string,
  provider: string,
  style: StyleConfig,
  existing: GlyphEdits,
  onProgress: (done: number, total: number, char: string) => void,
  onCheckpoint?: (edits: GlyphEdits) => Promise<void>,
  onPhase?: (
    phase: "request" | "trace",
    done: number,
    total: number,
    char: string,
  ) => void,
) {
  return runSingleGeneration(
    { text: characters, reference, provider, style, existing },
    {
      request: requestGlyph,
      characterTemplate: provider === "bailian" && reference
        ? (character) => glyphStructureTemplate(character, style)
        : undefined,
      trace: vectorizeDetailed,
      checkpoint: onCheckpoint,
      progress: onProgress,
      phase: onPhase,
    },
  );
}
