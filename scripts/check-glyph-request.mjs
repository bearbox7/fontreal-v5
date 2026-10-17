import assert from "node:assert/strict";
import { requestGlyph } from "../lib/font/glyph-request.ts";
let seen;
const good = await requestGlyph(
  { character: "字", provider: "openai" },
  async (url, init) => {
    seen = { url, init };
    return Response.json({
      image: "data:image/png;base64,fixture",
      model: "fixture",
    });
  },
);
assert.ok(good.image.startsWith("data:image/"));
assert.equal(seen.url, "/api/glyph");
assert.equal(seen.init.method, "POST");
assert.equal(JSON.parse(seen.init.body).character, "字");
assert.ok(seen.init.signal instanceof AbortSignal);
await assert.rejects(
  () =>
    requestGlyph({}, async () => {
      throw new TypeError("network");
    }),
  /中断或网络不可用/,
);
await assert.rejects(
  () =>
    requestGlyph({}, async () => {
      throw new DOMException("timeout", "TimeoutError");
    }),
  /等待超时/,
);
await assert.rejects(
  () =>
    requestGlyph({}, async () =>
      Response.json({ error: "额度不足" }, { status: 429 }),
    ),
  /额度不足/,
);
await assert.rejects(
  () =>
    requestGlyph(
      {},
      async () => new Response("<html>bad gateway</html>", { status: 502 }),
    ),
  /HTTP 502/,
);
await assert.rejects(
  () => requestGlyph({}, async () => Response.json({})),
  /没有返回有效图片/,
);
console.log(
  "Single-glyph request checks passed: request dispatch, timeout, interruption, upstream error, invalid response. Mock responses only; no paid API calls.",
);
