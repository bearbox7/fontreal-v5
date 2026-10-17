import { z } from "zod";
export const provider = z.enum(["openai", "gemini"]);
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
export function guard(request: Request, maxBytes = 6500000) {
  const origin = request.headers.get("origin");
  // Cloudflare Pages forwards requests from the public domain to the Render
  // server. Render can see its own hostname as request.url while the browser
  // correctly sends Origin: https://fontreal.pages.dev.
  // Only trust the canonical site and exact same-origin requests. Never trust
  // an arbitrary X-Forwarded-Host header or use an open CORS wildcard.
  const allowedOrigins = new Set([
    new URL(request.url).origin,
    "https://fontreal.pages.dev",
    // Cloudflare Pages bridge rewrites Origin to the backend's public HTTPS
    // hostname. Next.js on Render may still see a local http://localhost port
    // in request.url; allow this one exact known backend origin explicitly.
    "https://fontreal-v5.onrender.com",
  ]);
  if (origin && !allowedOrigins.has(origin))
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
