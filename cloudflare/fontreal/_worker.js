/**
 * Cloudflare Pages Advanced Mode proxy for the existing fontreal project.
 * Full Next.js/Python lives on Render; this Pages project retains the public URL
 * and the existing static editor from the original deployment bundle.
 * Set FONTREAL_BACKEND_ORIGIN to the backend's HTTPS origin in Pages settings.
 */
const jsonError = (error, status = 503) =>
  Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

function acceptsHtml(request) {
  return ["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("Accept") || "").includes("text/html");
}

export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url);
    const raw = String(env.FONTREAL_BACKEND_ORIGIN || "").trim().replace(/\/$/, "");

    if (publicUrl.pathname === "/__fontreal_mode") {
      return Response.json({
        mode: raw ? "full-v5-proxy" : "static-fallback",
        backendConfigured: Boolean(raw),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!raw) return env.ASSETS.fetch(request);

    let backend;
    try {
      backend = new URL(raw);
      if (backend.protocol !== "https:" || backend.username || backend.password ||
        backend.pathname !== "/" || backend.search || backend.hash ||
        backend.origin === publicUrl.origin || backend.origin !== raw) {
        throw new Error("Invalid upstream origin");
      }
    } catch {
      return jsonError("FontReal 后端地址配置无效。请在 Pages 中设置 HTTPS 后端根域名。");
    }

    const target = new URL(publicUrl.pathname + publicUrl.search, backend);
    const upstreamRequest = new Request(target, request);
    const origin = request.headers.get("Origin");
    if (origin === publicUrl.origin) upstreamRequest.headers.set("Origin", backend.origin);
    const referer = request.headers.get("Referer");
    if (referer?.startsWith(publicUrl.origin + "/")) {
      upstreamRequest.headers.set("Referer", backend.origin + referer.slice(publicUrl.origin.length));
    }
    upstreamRequest.headers.delete("Host");

    try {
      const upstream = await fetch(upstreamRequest, { redirect: "manual" });
      const headers = new Headers(upstream.headers);
      const location = headers.get("Location");
      if (location) {
        try {
          const redirect = new URL(location, backend.origin);
          if (redirect.origin === backend.origin) {
            headers.set("Location", publicUrl.origin + redirect.pathname + redirect.search + redirect.hash);
          }
        } catch { /* retain upstream response header */ }
      }
      headers.set("X-FontReal-Backend", "V5");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      if (acceptsHtml(request)) {
        const fallback = await env.ASSETS.fetch(request);
        if (fallback.ok) return fallback;
      }
      return jsonError("FontReal 服务端暂时不可用，请检查 Render 后端状态。");
    }
  },
};
