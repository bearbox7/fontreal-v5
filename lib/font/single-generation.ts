import type { GlyphEdits, StyleConfig } from "./types";

export function singleGenerationPlan(text: string, edits: GlyphEdits) {
  const characters = [...new Set(Array.from(text))].filter((c) => c.trim());
  const completed = characters.filter(
    (c) => !!edits[c]?.path && !edits[c]?.pendingGeneration,
  );
  const remaining = characters.filter((c) => !completed.includes(c));
  const images = remaining.filter(
    (c) => !!edits[c]?.pendingGeneration?.image || !!edits[c]?.sourceImage,
  );
  const requests = remaining.filter((c) => !images.includes(c));
  return { characters, completed, remaining, images, requests };
}
type ImageResult = {
  image: string;
  model?: string;
  prompt?: string;
  createdAt?: string;
};
type TraceResult = {
  path: string;
  nodes: number;
  fidelity: number;
  tolerance: number;
};
export async function runSingleGeneration(
  input: {
    text: string;
    reference: string;
    provider: string;
    style: StyleConfig;
    existing: GlyphEdits;
  },
  dependencies: {
    request: (payload: Record<string, unknown>) => Promise<ImageResult>;
    /** Optional neutral character skeleton, provided only for supported AI models. */
    characterTemplate?: (character: string) => Promise<string | undefined>;
    trace: (image: string) => Promise<TraceResult>;
    checkpoint?: (edits: GlyphEdits) => Promise<void>;
    progress: (done: number, total: number, character: string) => void;
    phase?: (
      phase: "request" | "trace",
      done: number,
      total: number,
      character: string,
    ) => void;
  },
) {
  const plan = singleGenerationPlan(input.text, input.existing);
  const edits = { ...input.existing };
  let done = plan.completed.length;
  dependencies.progress(done, plan.characters.length, "");
  for (const character of plan.remaining) {
    const previous = edits[character];
    const cached = previous?.pendingGeneration;
    let source: ImageResult;
    let generatedStyle =
      cached?.style || previous?.generatedStyle || input.style;
    if (cached?.image || previous?.sourceImage) {
      source = cached || {
        image: previous.sourceImage!,
        model: previous.model,
        prompt: previous.prompt,
        createdAt: previous.createdAt,
      };
    } else {
      dependencies.phase?.("request", done, plan.characters.length, character);
      // Style image has priority; a second neutral skeleton guides only
      // target-character structure and prevents accidental glyph substitution.
      const structureImage = input.provider === "bailian" && input.reference
        ? await dependencies.characterTemplate?.(character)
        : undefined;
      source = await dependencies.request({
        provider: input.provider,
        character,
        style: input.style,
        image: input.reference,
        ...(structureImage ? { characterReference: structureImage } : {}),
        variation: (previous?.version || 0) + 1,
      });
      generatedStyle = input.style;
      edits[character] = {
        ...(previous || { scale: 100, rotate: 0, x: 0, y: 0, version: 0 }),
        pendingGeneration: {
          image: source.image,
          model: source.model || "",
          prompt: source.prompt || "",
          createdAt: source.createdAt || "",
          style: generatedStyle,
        },
      };
      await dependencies.checkpoint?.({ ...edits });
    }
    dependencies.phase?.("trace", done, plan.characters.length, character);
    const traced = await dependencies.trace(source.image);
    edits[character] = {
      scale: 100,
      rotate: 0,
      x: 0,
      y: 0,
      path: traced.path,
      traceStats: {
        nodes: traced.nodes,
        fidelity: traced.fidelity,
        tolerance: traced.tolerance,
      },
      version: (previous?.version || 0) + 1,
      sourceImage: source.image,
      model: source.model,
      prompt: source.prompt,
      createdAt: source.createdAt,
      generatedStyle,
    };
    await dependencies.checkpoint?.({ ...edits });
    dependencies.progress(++done, plan.characters.length, character);
  }
  return edits;
}
