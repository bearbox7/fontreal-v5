import { readApiJson } from "./api-response";

export async function requestGlyph(
  payload: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("/api/glyph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(260_000),
    });
  } catch (e) {
    const kind = e instanceof Error ? e.name : "";
    throw Error(
      kind === "TimeoutError" || kind === "AbortError"
        ? "单字生成等待超时。已完成的字形已保留；请检查服务状态后再试。"
        : "单字生成请求已中断或网络不可用。请保持当前页面打开，并检查网络后再试。",
    );
  }
  const data = await readApiJson(response, "单字");
  if (!response.ok)
    throw Error(data.error || `单字生成失败（HTTP ${response.status}）`);
  if (typeof data.image !== "string" || !data.image.startsWith("data:image/"))
    throw Error("单字服务没有返回有效图片，请检查服务状态。");
  return data;
}
