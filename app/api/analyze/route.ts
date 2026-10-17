import { z } from "zod";
import { analyzeFont, ProviderError } from "@/lib/ai/providers";
import { guard, body, provider, image } from "@/lib/ai/validate";
export async function POST(request: Request) {
  const rejected = guard(request);
  if (rejected) return rejected;
  try {
    const data = z
      .object({
        provider,
        image: image.optional(),
        prompt: z.string().max(2000).optional(),
      })
      .refine((x) => x.image || x.prompt)
      .parse(await body(request));
    return Response.json(await analyzeFont(data.provider, data));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ProviderError
            ? e.message
            : "请求无效，请检查参考图或描述。",
      },
      { status: e instanceof ProviderError ? e.status : 400 },
    );
  }
}
