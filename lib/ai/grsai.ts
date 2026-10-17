/**
 * GrsAI standalone adapter. GrsAI is a third-party aggregator, not the OpenAI API.
 * Docs: https://qmy27nhsd9.apifox.cn/452409160e0
 *       https://qmy27nhsd9.apifox.cn/452418916e0
 * No paid calls are made when /api/status is checked.
 */
import { FONT_ANALYSIS_PROMPT } from "@/prompts/font-analysis";

export class GrsaiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const DEFAULT_HOST = "https://grsaiapi.com";
const ACCEPTED = new Set(["grsaiapi.com", "grsai.dakka.com.cn"]);
const asString = (x: unknown) => typeof x === "string" ? x : "";
function settings() {
  const apiKey = process.env.GRSAI_API_KEY;
  if (!apiKey) throw new GrsaiError("请在 Render 设置 GRSAI_API_KEY。", 503);
  const url = new URL(process.env.GRSAI_BASE_URL || DEFAULT_HOST);
  if (url.protocol !== "https:" || !ACCEPTED.has(url.hostname) || url.username || url.password ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new GrsaiError("GRSAI_BASE_URL 应为 https://grsaiapi.com 或 https://grsai.dakka.com.cn（不要加 /zh/v1）。", 503);
  }
  return { base: url.origin, apiKey };
}
async function invoke(path: string, payload: unknown, timeout = 110_000) {
  const { base, apiKey } = settings();
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new GrsaiError("GrsAI 请求超时或网络不可达，请检查 Render 日志。", 504);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new GrsaiError("GrsAI 密钥无效或无权访问此模型。", 502);
    if (response.status === 429) throw new GrsaiError("GrsAI 额度或频率限制，请稍后重试。", 429);
    throw new GrsaiError(`GrsAI 返回 HTTP ${response.status}：${asString(data?.msg || data?.message || data?.error).slice(0, 140)}`, 502);
  }
  if (!data || (typeof data.code === "number" && data.code !== 0))
    throw new GrsaiError("GrsAI 返回错误：" + asString(data?.msg || data?.message).slice(0, 140), 502);
  return data;
}
export async function grsaiAnalyze(input: {image?: string; prompt?: string}) {
  const model = process.env.GRSAI_ANALYSIS_MODEL;
  if (!model) throw new GrsaiError("请先设置 GRSAI_ANALYSIS_MODEL。", 503);
  const userContent: any[] = [{type:"text", text: input.prompt || "请分析参考图的中文字体设计特征。"}];
  if (input.image) userContent.push({type:"image_url", image_url: {url:input.image}});
  const json = await invoke("/v1/chat/completions", {
    model, stream:false,
    messages: [
      {role:"system",content: FONT_ANALYSIS_PROMPT + "\nReturn ONLY valid JSON without markdown or comments."},
      {role:"user",content: userContent},
    ],
  }, 90_000);
  const answer = json.choices?.[0]?.message?.content;
  const text = Array.isArray(answer) ? answer.map((x:any)=>asString(x.text)).join("") : asString(answer);
  const cleaned = text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
  if (!cleaned) throw new GrsaiError("GrsAI 分析未返回结构化结果。");
  return {text:cleaned,model};
}
function validImageUrl(s: string) {
  const url = new URL(s);
  // Allow only documented GrsAI-generated image hosts: prevent SSRF.
  const ok = /^file[0-9]{1,2}\.aitohumanize\.com$/i.test(url.hostname);
  if (url.protocol !== "https:" || url.port || url.username || url.password || !ok)
    throw new GrsaiError("GrsAI 返回的图片地址未在安全白名单中，请联系开发者确认域名。");
  return url;
}
async function downloadImage(s: string): Promise<string> {
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  const url = validImageUrl(s);
  let r: Response;
  try {
    r = await fetch(url, {redirect:"error",signal:AbortSignal.timeout(35_000)});
  } catch {throw new GrsaiError("无法下载 GrsAI 返回的图片。", 504)}
  if (!r.ok || Number(r.headers.get("content-length")) > 20_000_000)
    throw new GrsaiError("GrsAI 图片下载失败或超过 20MB。");
  const mime = (r.headers.get("content-type")||"").split(";")[0].trim();
  if (!["image/png","image/jpeg","image/webp"].includes(mime))
    throw new GrsaiError("GrsAI 返回的内容不是受支持的图片格式。");
  const bytes = await r.arrayBuffer();
  if (bytes.byteLength > 20_000_000) throw new GrsaiError("GrsAI 图片超过 20MB。");
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
export async function grsaiGenerate(prompt: string, images: string[], size = "1024x1024", quality = "low") {
  const model = process.env.GRSAI_IMAGE_MODEL;
  if (!model) throw new GrsaiError("请先设置 GRSAI_IMAGE_MODEL。", 503);
  // GrsAI new /v1/api/generate schema, not OpenAI's /images/edits.
  const data = await invoke("/v1/api/generate",{
    model, prompt, images, aspectRatio:size, quality, replyType:"json",
  },110_000);
  if (data.status !== "succeeded" && data.status !== "success")
    throw new GrsaiError("GrsAI 任务尚未成功完成：" + asString(data.status || data.msg).slice(0,100) + "。可稍后重试。", 504);
  const raw = data.results?.[0]?.url || data.results?.[0]?.image || data.results?.[0]?.b64_json;
  if (typeof raw !== "string") throw new GrsaiError("GrsAI 没有返回可用的图片。");
  return { image:await downloadImage(raw), model };
}
