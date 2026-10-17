import { requestGlyph } from "./glyph-request";
import { vectorizeDetailed } from "./engine";
import { resolveGlyphMentions } from "./glyph-mentions";
import { feedbackImage, glyphReferenceImage } from "./glyph-feedback-image";
import { feedbackListSchema } from "./glyph-feedback";
import type { GlyphEdit, GlyphEdits, StyleConfig } from "./types";
export async function redrawGlyph(input: {
  character: string; style: StyleConfig; edits: GlyphEdits; reference: string; provider: string;
  threshold?: number; tolerance?: number; glyphCharacters: string;
  checkpoint?: (edit: GlyphEdit) => Promise<void>;
}) {
  const previous = input.edits[input.character] || {scale:100,rotate:0,x:0,y:0,version:0};
  const points = feedbackListSchema.parse(previous.redrawComments || []);
  const mentions=resolveGlyphMentions([previous.redrawPrompt || "",...points.map(p=>p.text)],input.glyphCharacters);
  if(mentions.errors.length) throw Error(mentions.errors.join("；"));
  const pending = previous.pendingGeneration;
  const styleReference = input.reference || previous.sourceImage || "";
  const source = pending || await requestGlyph({
    provider:input.provider,character:input.character,style:input.style,
    ...(styleReference ? {image:styleReference}:{}),
    instructions:previous.redrawPrompt || "",
    ...(previous.redrawReference ? {characterReference:previous.redrawReference}:{}),
    ...(mentions.references.length ? {glyphReferences:mentions.references,glyphReferenceImage:await glyphReferenceImage(mentions.references.map(r=>r.character),input.style,input.edits)}:{}),
    ...((points.length || previous.manuallyEdited) ? {comments:points,annotationImage:await feedbackImage(input.character,input.style,input.edits,points)}:{}),
    variation:previous.version+1,
  });
  await input.checkpoint?.({...previous,pendingGeneration:{image:source.image,model:source.model || "",prompt:source.prompt || "",createdAt:source.createdAt || "",style:pending?.style || input.style}});
  const result = await vectorizeDetailed(source.image,input.threshold ?? 128,input.tolerance ?? 4);
  return {...previous,scale:100,rotate:0,x:0,y:0,path:result.path,
    traceStats:{nodes:result.nodes,fidelity:result.fidelity,tolerance:result.tolerance},
    sourceImage:source.image,model:source.model,prompt:source.prompt,createdAt:source.createdAt,
    generatedStyle:pending?.style || input.style,version:previous.version+1,pendingGeneration:undefined,
    redrawComments:[],manuallyEdited:false,
  } satisfies GlyphEdit;
}
