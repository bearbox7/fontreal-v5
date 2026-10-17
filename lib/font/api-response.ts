/**
 * Cloudflare/Render may return an HTML error/login page even when callers
 * expected JSON. Never leak raw HTML or a JSON.parse stack to users.
 */
export async function readApiJson<T = any>(
  response: Response,
  serviceName = "AI",
): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw Error(
      `${serviceName}服务未返回有效数据（HTTP ${response.status}），可能是代理超时、服务器休眠或登录状态失效，请刷新页面重试。`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw Error(
      `${serviceName}服务返回的数据格式异常（HTTP ${response.status}），请刷新页面后再试。`,
    );
  }
}
