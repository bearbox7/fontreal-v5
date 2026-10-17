import assert from "node:assert/strict";
import fs from "node:fs";
import {
  defaultExpansion,
  planExpansion,
  batchMissing,
  batchChunks,
  runExpansionBatch,
  uniqueCharacters,
} from "../lib/font/expansion.ts";
const charset = JSON.parse(
  fs.readFileSync(new URL("../public/fonts/charset.json", import.meta.url)),
);
const style = {
  base: "sans",
  weight: 600,
  width: 100,
  roundness: 0,
  slant: 0,
  tracking: 0,
};
const existing = { 字: { path: "preserve", version: 1 }, 的: { version: 1 } };
const state = { ...defaultExpansion(), quantity: 144 };
const plan = planExpansion(state, charset, existing);
assert.equal(plan.characters.length, 144);
assert.equal(plan.requests, 5);
assert.ok(!plan.characters.includes("字") && !plan.characters.includes("的"));
assert.equal(
  planExpansion({ ...state, capacity: 72 }, charset, existing).requests,
  2,
);
assert.equal(
  planExpansion({ ...state, mode: "single" }, charset, existing).requests,
  144,
);
const custom = planExpansion(
  { ...state, scope: "custom", customText: "字字新 A⚡\n" },
  charset,
  existing,
);
assert.deepEqual(custom.characters, ["新", "A"]);
assert.deepEqual(custom.unsupported, ["⚡"]);
assert.deepEqual(custom.skipped, ["字"]);
assert.equal(uniqueCharacters(charset.all).length, 3891); // Two spaces need no generated ink.
assert.equal(
  planExpansion({ ...state, quantity: 9999 }, charset, {}).characters.length,
  288,
);
const characters = plan.characters.slice(0, 73);
const batch = {
  id: "test",
  characters,
  mode: "sheet",
  capacity: 32,
  provider: "openai",
  style,
  reference: "fixture",
  createdAt: "fixture",
  sheets: [],
};
const image = (cs) => ({
  image: "fixture",
  model: "fixture",
  prompt: "fixture",
  createdAt: "fixture",
  width: 3840,
  height: 2160,
  cells: cs.map((character) => ({ character })),
});
let saved = batch,
  calls = [],
  sequence = [];
await assert.rejects(
  () =>
    runExpansionBatch(batch, {
      generate: async (_, cs) => {
        sequence.push("request");
        calls.push(cs);
        if (calls.length === 2) throw Error("request failed");
        return image(cs);
      },
      checkpoint: async (next) => {
        saved = next;
        sequence.push("save");
      },
      shouldPause: () => false,
      onProgress: () => {},
    }),
  /request failed/,
);
assert.deepEqual(sequence, ["save", "request", "save", "request"]);
assert.equal(batchMissing(saved).length, 41);
assert.deepEqual(
  batchChunks(saved).map((cs) => cs.length),
  [32, 9],
);
const returned = new Set(
  saved.sheets.flatMap((s) => s.cells.map((c) => c.character)),
);
calls = [];
const finished = await runExpansionBatch(saved, {
  generate: async (_, cs) => {
    assert.ok(cs.every((c) => !returned.has(c)));
    calls.push(cs);
    return image(cs);
  },
  checkpoint: async () => {},
  shouldPause: () => false,
  onProgress: () => {},
});
assert.deepEqual(
  calls.map((cs) => cs.length),
  [32, 9],
);
assert.equal(batchMissing(finished).length, 0);
let paused = false,
  pauseCalls = 0;
const stopped = await runExpansionBatch(batch, {
  generate: async (_, cs) => {
    pauseCalls++;
    return image(cs);
  },
  checkpoint: async (next) => {
    if (next.sheets.length) paused = true;
  },
  shouldPause: () => paused,
  onProgress: () => {},
});
assert.equal(pauseCalls, 1);
assert.equal(batchMissing(stopped).length, 41);
let forbiddenCalls = 0;
await assert.rejects(
  () =>
    runExpansionBatch(batch, {
      generate: async () => {
        forbiddenCalls++;
        return image([]);
      },
      checkpoint: async () => {
        throw Error("storage failed");
      },
      shouldPause: () => false,
      onProgress: () => {},
    }),
  /storage failed/,
);
assert.equal(forbiddenCalls, 0);
assert.deepEqual(
  batchChunks({
    ...batch,
    mode: "single",
    characters: characters.slice(0, 3),
  }).map((c) => c.length),
  [1, 1, 1],
);
console.log(
  "Expansion checks passed: existing glyph protection, request counts, unsupported text, saved checkpoints, failure resume, pause, and storage failure before requests. No live AI calls.",
);
