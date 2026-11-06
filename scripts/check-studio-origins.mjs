import assert from "node:assert/strict";
import { guard, isAllowedStudioOrigin } from "../lib/ai/validate.ts";

const internalURL = "http://127.0.0.1:5173/api/glyph";
const good = [
  "https://fontreal.pages.dev",
  "https://fontreal-ci-preview.fontreal.pages.dev",
  "https://fontreal-v5.onrender.com",
  "https://fontreal-v5-preview.onrender.com",
  "http://127.0.0.1:5173",
];
const bad = [
  "https://untrusted.example",
  "https://fontreal-v5-preview.onrender.com.evil.example",
  "https://other.fontreal.pages.dev",
  "http://fontreal-v5-preview.onrender.com",
  "https://fontreal-v5-preview.onrender.com:444",
];
for (const origin of good) {
  const req = new Request(internalURL,{method:"POST",headers:{origin}});
  assert.equal(isAllowedStudioOrigin(req),true,"Expected origin allowed: "+origin);
  assert.equal(guard(req),undefined,"Expected POST not blocked: "+origin);
}
for (const origin of bad) {
  const req = new Request(internalURL,{method:"POST",headers:{origin}});
  assert.equal(isAllowedStudioOrigin(req),false,"Unexpectedly allowed: "+origin);
  assert.equal(guard(req)?.status,403,"Expected 403 for: "+origin);
}
const noOrigin = new Request(internalURL,{method:"POST"});
assert.equal(isAllowedStudioOrigin(noOrigin),true);
assert.equal(guard(noOrigin),undefined);
const oversize = new Request(internalURL,{method:"POST",headers:{origin:good[3],"content-length":"7000000"}});
assert.equal(guard(oversize)?.status,413);
console.log("FontReal strict Origin guard: 12 regression checks passed. Trusted Preview/Production origins allowed, unknown origins rejected.");
