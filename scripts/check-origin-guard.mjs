import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

// Import the real TypeScript source, not a separately copied guard.
let source = await fs.readFile(new URL("../lib/ai/validate.ts", import.meta.url), "utf8");
source = source.replace('from "zod"', `from "${import.meta.resolve("zod")}"`);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { guard } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const renderURL = "https://fontreal-v5.onrender.com/api/glyph-sheet";
const publicURL = "https://fontreal.pages.dev/api/glyph-sheet";
function req(url, origin, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { ...(origin ? { origin } : {}), ...headers },
  });
}
assert.equal(guard(req(renderURL, "https://fontreal.pages.dev")), undefined,
  "Cloudflare Pages public origin forwarded to Render should be accepted");
assert.equal(guard(req(renderURL, "https://fontreal-v5.onrender.com")), undefined,
  "Render same-origin calls should still work");
assert.equal(guard(req(publicURL, "https://fontreal.pages.dev")), undefined,
  "Cloudflare unrewritten public URL should work");
assert.equal(guard(req(renderURL, undefined)), undefined,
  "Non-browser server requests without Origin preserve existing behavior");
for (const hostileOrigin of [
  "https://evil.example",
  "https://fontreal.pages.dev.attacker.example",
  "http://fontreal.pages.dev",
  "https://another.pages.dev",
  "null",
]) {
  const result = guard(req(renderURL, hostileOrigin, {
    "x-forwarded-host": "fontreal.pages.dev",
    "x-forwarded-proto": "https",
  }));
  assert.equal(result?.status, 403, `unexpected origin ${hostileOrigin} should be rejected`);
}
const tooLarge = guard(req(renderURL, "https://fontreal.pages.dev", {
  "content-length": "150",
}), 100);
assert.equal(tooLarge?.status, 413, "existing upload size guard must remain active");
console.log("Origin guard passed: Cloudflare->Render permitted; same-origin permitted; untrusted/spoofed origins denied; size guard retained.");
