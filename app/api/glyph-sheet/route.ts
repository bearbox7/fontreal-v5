import { z } from "zod";
import { generateSheet, ProviderError } from "@/lib/ai/providers";
import { guard, body, image, style } from "@/lib/ai/validate";
import { SHEET, sheetLayout, sheetSlots } from "@/lib/font/sheet-layout";
import { sheetPrompt } from "@/prompts/glyph-sheet";
export async function POST(request: Request) {
  const rejected = guard(request);
  if (rejected) return rejected;
  try {
    const data = z
      .object({
        capacity: z.union([z.literal(32), z.literal(72)]).default(72),
        characters: z
          .array(
            z.string().refine((c) => Array.from(c).length === 1 && !!c.trim()),
          )
          .min(1)
          .max(SHEET.capacity)
          .refine((c) => new Set(c).size === c.length),
        style,
        image,
        template: image,
      })
      .parse(await body(request));
    const layout = sheetLayout(data.capacity);
    if (data.characters.length > layout.capacity)
      throw new ProviderError(`此排版每张最多 ${layout.capacity} 个字。`, 400);
    const result = await generateSheet(
      sheetPrompt(data.characters, data.style, data.capacity),
      data.style,
      [data.image, data.template],
    );
    return Response.json({
      ...result,
      layout,
      slots: sheetSlots(data.characters, layout),
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ProviderError
            ? e.message
            : "批量请求无效，每张图支持 1–72 个不同字符。",
      },
      { status: e instanceof ProviderError ? e.status : 400 },
    );
  }
}
