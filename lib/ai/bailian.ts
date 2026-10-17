/**
 * Alibaba Cloud Model Studio (百炼) independent provider.
 * Qwen VL: OpenAI-compatible /chat/completions.
 * Qwen Image 3.0: DashScope synchronous multimodal generation endpoint.
 * https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference
 */
import { FONT_ANALYSIS_PROMPT } from "@/prompts/font-analysis";

export class BailianError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const DEFAULT_BASE = "https://dashscope.aliyuncs.com";
const LEGACY_HOSTS = new Set([
  "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com",
  "dashscope-us.aliyuncs.com", "dashscope-eu.aliyuncs.com", "dashscope-jp.aliyuncs.com"
]);
const WORKSPACE_HOST = /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|ap-northeast-1|us-east-1|eu-central-1|cn-hongkong)\.maas\.aliyuncs\.com$/;
const IMAGE_HOST = /^dashscope-result[a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const IMAGE_LIMIT = 25_000_000;

function base() {
  let url: URL;
  try { url = new URL(process.env.BAILIAN_BASE_URL || DEFAULT_BASE); }
  catch { throw new BailianError("BAILIAN_BASE_URL 无效，请填写百炼地域 API 根地址。", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !(LEGACY_HOSTS.has(url.hostname) || WORKSPACE_HOST.test(url.hostname)))
    throw new BailianError("BAILIAN_BASE_URL 仅支持阿里云百炼官方 API 域名，且不应包含 /compatible-mode/v1。", 503);
  return url.origin;
}
function config(modelKey: "BAILIAN_ANALYSIS_MODEL" | "BAILIAN_IMAGE_MODEL") {
  const apiKey = process.env.BAILIAN_API_KEY;
  const model = process.env[modelKey];
  if (!apiKey || !model) throw new BailianError("请在 Render 配置 BAILIAN_API_KEY、BAILIAN_ANALYSIS_MODEL 和 BAILIAN_IMAGE_MODEL。", 503);
  return { apiKey, model, root: base() };
}

async function call(url: string, apiKey: string, payload: unknown, timeoutMs: number) {
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(payload), redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { throw new BailianError("百炼 API 网络连接失败或超时，请检查 Render 日志。", 504); }
  const data: any = await r.json().catch(() => null);
  if (!r.ok || data?.code) {
    console.error("Bailian upstream error", r.status, String(data?.code || "").slice(0, 60));
    if ([401, 403].includes(r.status) || /^(InvalidApiKey|AccessDenied|InvalidAuthentication)/i.test(data?.code || ""))
      throw new BailianError("百炼密钥无效、所属地域不匹配，或没有模型访问权限。请检查 API Key 地域和模型授权。");
    if (r.status === 429 || /^(Throttling|QuotaExhausted|AllocationQuota)/i.test(data?.code || ""))
      throw new BailianError("百炼模型额度不足或请求过于频繁，请检查免费额度与限流。", 429);
    throw new BailianError("百炼服务请求失败（HTTP " + r.status + "，" + String(data?.code || "Unknown").slice(0, 60) + "）。请核对模型名称与地域。");
  }
  if (!data || typeof data !== "object") throw new BailianError("百炼 API 未返回有效响应。");
  return data;
}

export async function bailianAnalyze(input: { image?: string; prompt?: string }) {
  const { apiKey, model, root } = config("BAILIAN_ANALYSIS_MODEL");
  if (input.image && (!DATA_IMAGE.test(input.image) || input.image.length > 14_000_000))
    throw new BailianError("参考图必须是小于 10MB 的 PNG、JPG 或 WEBP。", 400);
  const message: any[] = [{
    type: "text",
    text: (input.prompt || "请分析这张图片的字体设计风格。") +
      "\n请严格按系统要求返回一个 JSON 对象，包含 description、category、tags、characters、style。不要使用 Markdown 或代码块。",
  }];
  if (input.image) message.push({ type: "image_url", image_url: { url: input.image } });
  const data = await call(root + "/compatible-mode/v1/chat/completions", apiKey, {
    model,
    messages: [
      { role: "system", content: FONT_ANALYSIS_PROMPT + "\n只能输出合法 JSON，禁止 Markdown 代码块。" },
      { role: "user", content: message },
    ],
    stream: false,
  }, 90_000);
  const answer = data.choices?.[0]?.message?.content;
  const result = typeof answer === "string" ? answer :
    Array.isArray(answer) ? answer.map((s: any) => typeof s.text === "string" ? s.text : "").join("") : "";
  const clean = result.trim().replace(/^[\x60]{3}(?:json)?\s*/i, "").replace(/\s*[\x60]{3}$/i, "");
  if (!clean) throw new BailianError("百炼视觉模型未返回有效的风格分析。");
  return { text: clean, model };
}

function imageLink(raw: unknown) {
  if (typeof raw !== "string") throw new BailianError("百炼图片模型未返回下载地址。");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new BailianError("百炼返回的图片地址无效。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !IMAGE_HOST.test(url.hostname))
    throw new BailianError("百炼生成图片的下载域名不在安全白名单，请联系开发者确认。");
  return url;
}
async function fetchImage(raw: unknown) {
  const url = imageLink(raw);
  let response: Response;
  try { response = await fetch(url, {redirect:"error", signal:AbortSignal.timeout(40_000)}); }
  catch { throw new BailianError("下载百炼生成的图片失败，请重试。", 504); }
  if (!response.ok || Number(response.headers.get("content-length")) > IMAGE_LIMIT)
    throw new BailianError("百炼返回的图片下载失败或尺寸超过限制。");
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw new BailianError("百炼返回了不支持的图片格式。");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > IMAGE_LIMIT) throw new BailianError("百炼生成的图片体积超过 25MB 限制。");
  return "data:" + mime + ";base64," + Buffer.from(bytes).toString("base64");
}

export async function bailianGenerate(prompt: string, images: string[]) {
  // Qwen Image 3.0 supports a maximum of 3 reference images. Validate
  // before any chargeable API call to avoid discarded glyph references.
  if (images.length > 3)
    throw new BailianError("百炼 Qwen Image 最多支持 3 张参考图。请减少额外字形参考后重试。", 400);
  for (const image of images)
    if (!DATA_IMAGE.test(image) || image.length > 14_000_000)
      throw new BailianError("参考图必须是小于 10MB 的 PNG、JPG 或 WEBP。", 400);
  const { apiKey, model, root } = config("BAILIAN_IMAGE_MODEL");
  const content = [...images.map(image => ({ image })), { text: prompt }];
  const data = await call(root + "/api/v1/services/aigc/multimodal-generation/generation", apiKey, {
    model,
    input: { messages: [{ role:"user", content }] },
    parameters: { n:1, size:"1024*1024", watermark:false, prompt_extend:false },
  }, 180_000);
  const raw = data.output?.choices?.[0]?.message?.content?.find((x: any) => x.image)?.image;
  return { image: await fetchImage(raw), model };
}
