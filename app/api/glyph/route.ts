import { feedbackListSchema } from "@/lib/font/glyph-feedback";
import { z } from "zod";
import { generateGlyph, ProviderError } from "@/lib/ai/providers";
import { guard, body, provider, image, style } from "@/lib/ai/validate";
export async function POST(request: Request) {
  const rejected = guard(request, 25000000);
  if (rejected) return rejected;
  try {
    const data = z
      .object({
        provider,
        character: z.string().refine((x) => Array.from(x).length === 1),
        style,
        image: image.optional(),
        glyphReferenceImage: image.optional(),
        glyphReferences: z.array(z.object({character:z.string().refine(x=>Array.from(x).length===1),code:z.string()}).refine(r=>r.code===`U+${r.character.codePointAt(0)!.toString(16).toUpperCase().padStart(4,"0")}`)).max(4).default([]),
        annotationImage: image.optional(),
        comments: feedbackListSchema.default([]),
        instructions: z.string().max(2000).optional(),
        characterReference: image.optional(),
        variation: z.number().int().min(0).max(1000000).default(0),
      })
      .parse(await body(request, 25000000));
    if(data.glyphReferences.length && !data.glyphReferenceImage) throw Error("Missing reference glyphs");
    if (data.comments.length && !data.annotationImage) throw Error("Missing annotated glyph");
    return Response.json(
      await generateGlyph(
        data.provider,
        data.character,
        data.style,
        data.image,
        data.variation,
        data.instructions,
        data.characterReference,
        data.comments,
        data.annotationImage,
        data.glyphReferences,
        data.glyphReferenceImage,
      ),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ProviderError
            ? e.message
            : "字形请求无效，请选择单个字符。",
      },
      { status: e instanceof ProviderError ? e.status : 400 },
    );
  }
}
