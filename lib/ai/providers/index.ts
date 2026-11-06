import { z } from "zod";
import type { Analysis, StyleConfig } from "@/lib/font/types";
import { FONT_ANALYSIS_PROMPT, STYLE_SCHEMA } from "@/prompts/font-analysis";
import { glyphReferenceInstructions, type GlyphReference } from "@/lib/font/glyph-mentions";
import { feedbackInstructions, type GlyphFeedback } from "@/lib/font/glyph-feedback";
import { glyphPrompt, bailianReferencePrompt } from "@/prompts/glyph-generation";
export type ProviderName = "grsai" | "openai" | "gemini" | "bailian";
export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
function env(name: string) {
  return process.env[name] || "";
}
function requiredModel(name: string) {
  const value = env(name);
  if (!value) throw new ProviderError(`请在服务器 .env.local 中配置 ${name}，填写你所用平台可用的模型名。`, 503);
  return value;
}
function openaiURL(path: string) {
  const base = new URL(env("OPENAI_BASE_URL") || "https://api.openai.com/v1");
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new ProviderError("服务器 AI 接口地址配置无效。", 503);
  return base.toString().replace(/\/$/, "") + path;
}
export function providerStatus() {
  return {
    grsai: !!(env("GRSAI_API_KEY") && env("GRSAI_IMAGE_MODEL") && env("GRSAI_ANALYSIS_MODEL")),
    openai: !!(env("OPENAI_API_KEY") && env("OPENAI_ANALYSIS_MODEL") && env("OPENAI_IMAGE_MODEL")),
    gemini: !!(env("GEMINI_API_KEY") && env("GEMINI_ANALYSIS_MODEL") && env("GEMINI_IMAGE_MODEL")),
    bailian: !!(env("BAILIAN_API_KEY") && env("BAILIAN_ANALYSIS_MODEL") && env("BAILIAN_IMAGE_MODEL")),
  };
}
const resultSchema = z.object({
  description: z.string().max(1200),
  category: z.string().max(100),
  tags: z.array(z.string().max(60)).max(12),
  characters: z
    .array(
      z.object({
        character: z.string().min(1).max(8),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      }),
    )
    .max(30),
  style: z.object({
    base: z.enum(["sans", "serif"]),
    weight: z.number().min(300).max(800),
    width: z.number().min(70).max(130),
    roundness: z.number().min(0).max(100),
    slant: z.number().min(-15).max(15),
    tracking: z.number().min(-5).max(20),
  }),
});
async function request(url: string, init: RequestInit, timeout = 65000) {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "NetworkError";
    console.error("AI upstream connection:", name);
    throw new ProviderError(
      name === "TimeoutError" || name === "AbortError"
        ? "AI 服务请求超时，请稍后重试。"
        : "无法连接 AI 服务，请检查服务器网络。",
      504,
    );
  }
  if (!r.ok) {
    let detail = "";
    try {
      const body: any = await r.json();
      detail = String(body.error?.message || body.error?.status || body.message || body.code || "")
        .replace(/AIza[\w-]+|sk-[\w-]+/g, "[redacted]")
        .slice(0, 300);
    } catch {}
    console.error("AI upstream rejected:", r.status, detail);
    if (r.status === 401 || r.status === 403)
      throw new ProviderError(
        "AI 服务鉴权失败，请检查服务器 API 密钥与模型权限。",
        502,
      );
    if (r.status === 429)
      throw new ProviderError(
        "AI 服务额度不足或请求过于频繁，请稍后重试。",
        429,
      );
    throw new ProviderError(
      `AI 服务错误（${r.status}）：${detail || "请稍后重试"}`,
    );
  }
  return r.json() as Promise<any>;
}
function key(provider: ProviderName) {
  const k = env(provider === "grsai" ? "GRSAI_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "BAILIAN_API_KEY");
  if (!k)
    throw new ProviderError(
      "尚未配置此 AI 服务的服务器密钥。可继续使用基础风格模式。",
      503,
    );
  return k;
}
function splitImage(image: string) {
  const match = image.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) throw new ProviderError("请上传 PNG、JPG 或 WEBP 图片。", 400);
  return { mime: match[1], data: match[2] };
}
// Use only official Bailian inference domains to avoid arbitrary upstream requests.
function bailianURL(path: string) {
  let base: URL;
  try {
    base = new URL(env("BAILIAN_BASE_URL") || "https://dashscope.aliyuncs.com");
  } catch {
    throw new ProviderError("百炼接口地址不是有效的 HTTPS URL。", 503);
  }
  const hostname = base.hostname;
  const official = hostname === "dashscope.aliyuncs.com" ||
    hostname === "dashscope-intl.aliyuncs.com" ||
    /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|eu-central-1|ap-northeast-1|us-east-1|cn-hongkong)\.maas\.aliyuncs\.com$/.test(hostname);
  if (!official || base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash || base.pathname !== "/")
    throw new ProviderError("阿里云百炼接口地址无效，请使用与 API Key 同地域的官方域名。", 503);
  return base.origin + path;
}
function bailianError(data: any) {
  if (!data?.code) return;
  const code = String(data.code).slice(0, 80);
  if (/InvalidApiKey|Unauthorized|AccessDenied|PermissionDenied/i.test(code))
    throw new ProviderError("百炼鉴权失败，请检查 API Key、业务空间和地域。", 502);
  if (/Quota|Throttling|RateLimit|Balance/i.test(code))
    throw new ProviderError("百炼配额不足或触发限流，请检查控制台额度。", 429);
  throw new ProviderError("百炼返回错误（" + code + "），请检查模型是否在当前地域可用。");
}
// Bailian image responses contain expiring signed OSS URLs. Download server-side
// and return a data URL so projects keep working after the OSS URL expires.
async function bailianImageResult(data: any): Promise<string> {
  bailianError(data);
  const image = data.output?.choices?.[0]?.message?.content?.find((part: any) => part.image)?.image;
  if (typeof image !== "string") throw new ProviderError("百炼未返回字形图片，请检查模型与提示词。");
  let url: URL;
  try { url = new URL(image); } catch { throw new ProviderError("百炼图片地址无效。"); }
  // Bailian's OSS image bucket names are dynamic: official responses may use
  // dashscope-{id}.oss-accelerate.aliyuncs.com or
  // dashscope-{id}.oss-cn-{region}.aliyuncs.com, not only dashscope-result-*.
  // Allow these exact Alibaba Cloud hostname patterns only (not arbitrary URLs).
  const allowedOssHost =
    /^dashscope-[a-z0-9-]+\.oss-(?:accelerate|cn-[a-z0-9-]+)\.aliyuncs\.com$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || !allowedOssHost) {
    // Log only the hostname, never the URL: signed OSS query strings contain credentials.
    console.error("Bailian rejected image download host:", url.hostname);
    throw new ProviderError("百炼返回了不受支持的图片下载地址。");
  }
  let response: Response;
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45000) });
  } catch {
    throw new ProviderError("百炼图片下载失败或超时，请重试。", 504);
  }
  if (!response.ok || Number(response.headers.get("content-length")) > 25000000)
    throw new ProviderError("百炼图片下载失败或文件过大。");
  const mime = response.headers.get("content-type")?.split(";")[0] || "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw new ProviderError("百炼返回的图片格式不受支持。");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25000000) throw new ProviderError("百炼图片过大。");
  return "data:" + mime + ";base64," + Buffer.from(bytes).toString("base64");
}

async function imageResult(data: any): Promise<string> {
  const item = data.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  // 302.AI may return its own CDN URL instead of base64.
  if (item?.url) {
    const url = new URL(item.url);
    if (
      url.protocol !== "https:" ||
      !["file.302.ai", "file.302ai.cn"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new ProviderError("AI 返回了不支持的图片地址。");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(40000),
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 25000000
    )
      throw new ProviderError("无法读取生成的图片。");
    const mime =
      response.headers.get("content-type")?.split(";")[0] || "image/png";
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
      throw new ProviderError("AI 返回的图片格式无效。");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 25000000) throw new ProviderError("AI 返回的图片过大。");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${mime};base64,${btoa(binary)}`;
  }
  throw new ProviderError("AI 未返回有效的字形图片。");
}

// GrsAI's newer image API uses /v1/api/generate (not the legacy /v1/draw path).
// An explicit host allow-list prevents accidentally sending a secret to an untrusted URL.
function grsaiURL(path: "/v1/api/generate" | "/v1/chat/completions") {
  const configured = env("GRSAI_BASE_URL") || "https://grsaiapi.com";
  let base: URL;
  try { base = new URL(configured); }
  catch { throw new ProviderError("GrsAI 服务地址无效。", 503); }
  if (base.protocol !== "https:" ||
    !["grsaiapi.com", "grsai.dakka.com.cn"].includes(base.hostname) ||
    base.username || base.password || base.port || base.pathname !== "/" ||
    base.search || base.hash || base.origin !== configured.replace(/\/$/, "")) {
    throw new ProviderError("GrsAI 仅允许使用官方 HTTPS 全球/国内节点的根地址。", 503);
  }
  return base.origin + path;
}

async function grsaiImageResult(data: any): Promise<string> {
  const payload = data?.data && typeof data.data === "object" ? data.data : data;
  const code = data?.code ?? payload?.code;
  const status = String(payload?.status || "");
  if (code !== undefined && code !== null && code !== 0 && code !== "0") {
    const message = String(data?.msg || payload?.msg || "").slice(0, 180);
    if (/quota|balance|credit|额度|余额|积分|429/i.test(message)) {
      throw new ProviderError("GrsAI 额度不足或触发限流，请检查 GrsAI 控制台积分。", 429);
    }
    throw new ProviderError("GrsAI 返回错误，请核对密钥、模型及接口权限（代码 " + String(code).slice(0, 20) + "）。");
  }
  if (["failed", "error", "canceled", "cancelled"].includes(status)) {
    throw new ProviderError("GrsAI 图片生成失败，请查看控制台任务记录并核对模型。");
  }
  if (["running", "pending", "queued", "processing"].includes(status)) {
    throw new ProviderError("GrsAI 返回未完成任务。当前采用同步 json 模式，请检查模型响应或超时设置。", 504);
  }
  const item = payload?.results?.[0] || payload?.data?.[0] || {};
  const inline = item?.content || item?.b64_json || payload?.b64_json;
  if (typeof inline === "string" && inline.length > 0) {
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(inline))
      return inline;
    if (/^[A-Za-z0-9+/=]+$/.test(inline))
      return "data:image/png;base64," + inline;
  }
  const uri = item?.url;
  if (typeof uri !== "string")
    throw new ProviderError("GrsAI 没有返回图片，请检查模型是否支持图片生成。");
  let url: URL;
  try { url = new URL(uri); } catch { throw new ProviderError("GrsAI 返回的图片地址无效。"); }
  // Official documentation shows fileN.aitohumanize.com as its generated-image CDN.
  // A tight host allow-list avoids server-side request forgery via model responses.
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^file\d+\.aitohumanize\.com$/.test(url.hostname)) {
    throw new ProviderError("GrsAI 图片域名尚未纳入安全白名单，请提交生成结果的域名供核对（不要发送签名完整链接）。");
  }
  let response: Response;
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45000) });
  } catch { throw new ProviderError("GrsAI 图片下载失败或超时，请重试。", 504); }
  if (!response.ok || Number(response.headers.get("content-length")) > 25000000)
    throw new ProviderError("GrsAI 图片获取失败或体积超限。");
  const mime = (response.headers.get("content-type") || "").split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw new ProviderError("GrsAI 返回的文件不是可用的 PNG/JPG/WEBP 图片。");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25000000) throw new ProviderError("GrsAI 图片体积超限。");
  return "data:" + mime + ";base64," + Buffer.from(bytes).toString("base64");
}

export async function analyzeFont(
  provider: ProviderName,
  input: { image?: string; prompt?: string },
): Promise<{ analysis: Analysis; model: string; prompt: string }> {
  const apiKey = key(provider);
  let output: string;
  let model: string;
  if (provider === "grsai") {
    model = requiredModel("GRSAI_ANALYSIS_MODEL");
    const content: any[] = [
      { type: "text", text: input.prompt || "请分析参考图的字体风格，并识别字符。" },
    ];
    if (input.image) {
      splitImage(input.image);
      content.push({ type: "image_url", image_url: { url: input.image } });
    }
    const data = await request(grsaiURL("/v1/chat/completions"), {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: FONT_ANALYSIS_PROMPT + " Output ONLY a valid JSON object that matches this schema: " + JSON.stringify(STYLE_SCHEMA) },
          { role: "user", content },
        ],
      }),
    }, 90000);
    output = data?.choices?.[0]?.message?.content || "";
    if (Array.isArray(output)) output = output.map((c: any) => c.text || "").join("");
  } else if (provider === "openai") {
    model = requiredModel("OPENAI_ANALYSIS_MODEL");
    const content: any[] = [
      {
        type: "input_text",
        text: input.prompt || "请分析参考图的字体风格，并识别字符。",
      },
    ];
    if (input.image) {
      splitImage(input.image);
      content.push({ type: "input_image", image_url: input.image });
    }
    const data = await request(openaiURL("/responses"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: FONT_ANALYSIS_PROMPT,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "font_style",
            schema: STYLE_SCHEMA,
            strict: true,
          },
        },
        max_output_tokens: 3000,
      }),
    });
    output =
      data.output
        ?.flatMap((x: any) => x.content || [])
        .filter((x: any) => x.type === "output_text")
        .map((x: any) => x.text)
        .join("") || "";
  } else if (provider === "bailian") {
    model = requiredModel("BAILIAN_ANALYSIS_MODEL");
    const content: any[] = [{ type: "text", text: input.prompt || "请分析参考图的字体风格，并识别字符。" }];
    if (input.image) {
      splitImage(input.image);
      content.push({ type: "image_url", image_url: { url: input.image } });
    }
    const data = await request(bailianURL("/compatible-mode/v1/chat/completions"), {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: FONT_ANALYSIS_PROMPT + " Return a raw JSON object, no Markdown. Follow this exact JSON schema: " + JSON.stringify(STYLE_SCHEMA) },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
      }),
    });
    bailianError(data);
    output = data.choices?.[0]?.message?.content || "";
  } else {
    model = requiredModel("GEMINI_ANALYSIS_MODEL");
    const parts: any[] = [
      { text: input.prompt || "请分析参考图的字体风格，并识别字符。" },
    ];
    if (input.image) {
      const i = splitImage(input.image);
      parts.push({ inlineData: { mimeType: i.mime, data: i.data } });
    }
    const data = await request(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: FONT_ANALYSIS_PROMPT }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseFormat: {
              text: { mimeType: "application/json", schema: STYLE_SCHEMA },
            },
          },
        }),
      },
    );
    output =
      data.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text || "")
        .join("") || "";
  }
  try {
    return {
      analysis: resultSchema.parse(JSON.parse(output)),
      model,
      prompt: FONT_ANALYSIS_PROMPT,
    };
  } catch {
    throw new ProviderError(
      "AI 返回的风格数据不完整，请换一张清晰参考图重试。",
    );
  }
}
export async function generateGlyph(
  provider: ProviderName,
  character: string,
  style: StyleConfig,
  image?: string,
  variation = 0,
  instructions = "",
  characterReference?: string,
  comments: GlyphFeedback[] = [],
  annotationImage?: string,
  glyphReferences: GlyphReference[] = [],
  glyphReferenceImage?: string,
) {
  return generateImage(
    provider,
    ((provider === "bailian" || provider === "grsai") ? bailianReferencePrompt(character, style, !!image, !!characterReference) + "\n" : "") +
    glyphPrompt(character, style, variation, instructions, characterReference ? (image ? "Image 1 is the overall lettering style reference. Image 2 is the correct target glyph structure reference; use it to fix missing or incorrect strokes while matching image 1 style." : "The attached image is the correct target glyph reference. Preserve its complete structure and follow the font style settings.") : "") + glyphReferenceInstructions(glyphReferences, 1 + Number(!!image) + Number(!!characterReference)) + feedbackInstructions(comments) + (annotationImage && !comments.length ? "\nThe LAST image is the current manually edited target glyph. Continue refining that outline; preserve its manual changes unless explicitly requested otherwise." : ""),
    style,
    [image, characterReference, glyphReferenceImage, annotationImage].filter((value): value is string => !!value),
  );
}
export async function generateSheet(
  prompt: string,
  style: StyleConfig,
  images: string[],
) {
  return generateImage("openai", prompt, style, images, "3840x2160", "medium");
}
async function generateImage(
  provider: ProviderName,
  prompt: string,
  style: StyleConfig,
  images: string[],
  size = "1024x1024",
  quality = "low",
) {
  const apiKey = key(provider);
  let model: string;
  let result: string;
  if (provider === "grsai") {
    model = requiredModel("GRSAI_IMAGE_MODEL");
    // GrsAI new unified API, synchronous JSON mode. Reference images use data URLs.
    images.forEach(splitImage);
    const isBanana = model.startsWith("nano-banana");
    const payload = {
      model,
      prompt,
      images,
      aspectRatio: isBanana ? "1:1" : size,
      ...(isBanana ? { imageSize: "1K" } : { quality: "auto" }),
      replyType: "json",
    };
    const data = await request(grsaiURL("/v1/api/generate"), {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 240000);
    result = await grsaiImageResult(data);
  } else if (provider === "openai") {
    model = requiredModel("OPENAI_IMAGE_MODEL");
    let data: any;
    if (images.length) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      form.set("size", size);
      form.set("quality", quality);
      form.set("n", "1");
      form.set("output_format", "png");
      for (const [index, image] of images.entries()) {
        const i = splitImage(image);
        const bytes = Uint8Array.from(atob(i.data), (c) => c.charCodeAt(0));
        form.append(
          "image[]",
          new Blob([bytes], { type: i.mime }),
          `reference-${index}.` +
            (i.mime === "image/jpeg" ? "jpg" : i.mime.split("/")[1]),
        );
      }
      data = await request(
        openaiURL("/images/edits"),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
        240000,
      );
    } else
      data = await request(
        openaiURL("/images/generations"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            size,
            quality,
            n: 1,
          }),
        },
        240000,
      );
    result = await imageResult(data);
  } else if (provider === "bailian") {
    model = requiredModel("BAILIAN_IMAGE_MODEL");
    // Qwen-Image 3.0 accepts at most three reference images; 2.1 supports ten.
    const maxImages = model.startsWith("qwen-image-2.1") ? 10 : 3;
    if (images.length > maxImages)
      throw new ProviderError("当前百炼图像模型最多支持 " + maxImages +
        " 张参考图，请减少参考图或切换为 qwen-image-2.1 系列。", 400);
    const content: any[] = images.map((image) => {
      splitImage(image);
      return { image };
    });
    content.push({ text: prompt });
    const data = await request(bailianURL("/api/v1/services/aigc/multimodal-generation/generation"), {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: "user", content }] },
        parameters: { n: 1, size: size.replace("x", "*"), watermark: false, prompt_extend: false },
      }),
    }, 240000);
    result = await bailianImageResult(data);
  } else {
    model = requiredModel("GEMINI_IMAGE_MODEL");
    const parts: any[] = [{ text: prompt }];
    for (const image of images) {
      const i = splitImage(image);
      parts.push({ inlineData: { mimeType: i.mime, data: i.data } });
    }
    const data = await request(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
      150000,
    );
    const inline = data.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData,
    )?.inlineData;
    if (!inline) throw new ProviderError("AI 未返回有效的字形图片。");
    result = `data:${inline.mimeType};base64,${inline.data}`;
  }
  return {
    image: result,
    model,
    prompt,
    parameters: style,
    createdAt: new Date().toISOString(),
  };
}
