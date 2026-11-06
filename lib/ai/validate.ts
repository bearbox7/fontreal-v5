import { z } from "zod";
export const provider = z.enum(["grsai", "openai", "gemini", "bailian"]);
export const image = z
  .string()
  .max(6000000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
export const style = z.object({
  base: z.enum(["sans", "serif"]),
  weight: z.number().min(300).max(800),
  width: z.number().min(70).max(130),
  roundness: z.number().min(0).max(100),
  slant: z.number().min(-15).max(15),
  tracking: z.number().min(-5).max(20),
});
// Explicit allow-list for FontReal's established production and isolated preview
// domains. Cloudflare Pages re-targets the browser's Origin header to its
// configured Render origin; Next.js may still see an internal request URL.
// Never accept arbitrary origins, wildcard domains, or X-Forwarded-Host.
const studioOrigins = new Set([
  "https://fontreal.pages.dev",
  "https://fontreal-ci-preview.fontreal.pages.dev",
  "https://fontreal-v5.onrender.com",
  "https://fontreal-v5-preview.onrender.com",
]);

export function isAllowedStudioOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin ||
    origin === new URL(request.url).origin ||
    studioOrigins.has(origin);
}

export function guard(request: Request, maxBytes = 6500000) {
  if (!isAllowedStudioOrigin(request))
    return Response.json({ error: "不支持跨站请求。" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > maxBytes)
    return Response.json(
      { error: "图片过大，请压缩后重试。" },
      { status: 413 },
    );
}
export async function body(request: Request, maxBytes = 6500000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("payload");
  return JSON.parse(text);
}
