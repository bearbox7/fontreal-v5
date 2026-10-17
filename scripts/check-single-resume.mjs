import assert from "node:assert/strict";
import {
  singleGenerationPlan,
  runSingleGeneration,
} from "../lib/font/single-generation.ts";
const style = {
  base: "sans",
  weight: 600,
  width: 100,
  roundness: 0,
  slant: 0,
  tracking: 0,
};
const base = { scale: 100, rotate: 0, x: 0, y: 0, version: 2 };
const complete = {
  ...base,
  path: "M0 0L100 0L100 100Z",
  model: "fixture",
  sourceImage: "image:甲",
  generatedStyle: style,
};
const initial = { 甲: complete };
let saved = initial,
  calls = [],
  traces = [],
  progresses = [];
const request = async ({ character }) => {
  calls.push(character);
  return {
    image: `image:${character}`,
    model: "fixture",
    prompt: character,
    createdAt: "fixture",
  };
};
const trace = async (image) => {
  traces.push(image);
  return { path: "M0 0L20 20Z", nodes: 3, fidelity: 1, tolerance: 1 };
};
await assert.rejects(
  () =>
    runSingleGeneration(
      {
        text: "甲乙丙丁",
        reference: "ref",
        provider: "openai",
        style,
        existing: initial,
      },
      {
        request,
        trace: async (image) => {
          if (image === "image:丙") throw Error("trace interrupted");
          return trace(image);
        },
        checkpoint: async (next) => {
          saved = JSON.parse(JSON.stringify(next));
        },
        progress: (done, total) => progresses.push([done, total]),
      },
    ),
  /trace interrupted/,
);
assert.deepEqual(calls, ["乙", "丙"]);
assert.equal(saved.甲.path, complete.path);
assert.ok(saved.乙.path);
assert.equal(saved.丙.pendingGeneration.image, "image:丙");
assert.deepEqual(singleGenerationPlan("甲乙丙丁", saved).requests, ["丁"]);
calls = [];
traces = [];
progresses = [];
const result = await runSingleGeneration(
  {
    text: "甲乙丙丁",
    reference: "ref",
    provider: "openai",
    style,
    existing: saved,
  },
  {
    request,
    trace,
    checkpoint: async (next) => {
      saved = next;
    },
    progress: (done, total) => progresses.push([done, total]),
  },
);
assert.deepEqual(calls, ["丁"]);
assert.deepEqual(traces, ["image:丙", "image:丁"]);
assert.deepEqual(progresses[0], [2, 4]);
assert.deepEqual(progresses.at(-1), [4, 4]);
assert.deepEqual(result.甲, complete);
assert.equal(result.乙.version, 1);
assert.equal(result.丙.pendingGeneration, undefined);
assert.equal(singleGenerationPlan("甲乙丙丁", result).remaining.length, 0);
calls = [];
traces = [];
await runSingleGeneration(
  {
    text: "丁丙乙甲甲\n",
    reference: "",
    provider: "openai",
    style,
    existing: result,
  },
  { request, trace, progress: () => {} },
);
assert.deepEqual(calls, []);
assert.deepEqual(traces, []);
const plan = singleGenerationPlan("甲乙丙丁", { 甲: complete, 丙: complete });
assert.deepEqual(plan.remaining, ["乙", "丁"]);
const pendingOld = {
  ...complete,
  pendingGeneration: {
    image: "new-image",
    model: "fixture",
    prompt: "new",
    createdAt: "fixture",
    style,
  },
};
calls = [];
traces = [];
const replaced = await runSingleGeneration(
  {
    text: "甲",
    reference: "",
    provider: "openai",
    style,
    existing: { 甲: pendingOld },
  },
  { request, trace, progress: () => {} },
);
assert.deepEqual(calls, []);
assert.deepEqual(traces, ["new-image"]);
assert.equal(replaced.甲.version, 3);
assert.equal(pendingOld.path, complete.path);
const cached = {
  ...base,
  sourceImage: "cached-old-format",
  model: "fixture",
  generatedStyle: style,
};
calls = [];
const old = await runSingleGeneration(
  {
    text: "乙",
    reference: "",
    provider: "openai",
    style: { ...style, width: 110 },
    existing: { 乙: cached },
  },
  { request, trace, progress: () => {} },
);
assert.deepEqual(calls, []);
assert.deepEqual(old.乙.generatedStyle, style);
calls = [];
await assert.rejects(
  () =>
    runSingleGeneration(
      {
        text: "乙丙",
        reference: "ref",
        provider: "openai",
        style,
        existing: {},
      },
      {
        request,
        trace,
        progress: () => {},
        checkpoint: async (next) => {
          saved = next;
          throw Error("storage failed");
        },
      },
    ),
  /storage failed/,
);
assert.deepEqual(calls, ["乙"]);
assert.deepEqual(singleGenerationPlan("乙丙", saved).images, ["乙"]);

const templateCalls = [];
const bailianPayloads = [];
await runSingleGeneration(
  {text:"永字",reference:"design-reference",provider:"bailian",style,existing:{}},
  {
    request: async payload => {
      bailianPayloads.push(payload);
      return {image:"image:" + payload.character,model:"qwen-image-3.0"};
    },
    characterTemplate: async character => {
      templateCalls.push(character);
      return character === "永" ? "data:image/png;base64,skeleton" : undefined;
    },
    trace,
    progress: () => {},
  },
);
assert.deepEqual(templateCalls, ["永","字"]);
assert.equal(bailianPayloads[0].image,"design-reference");
assert.equal(bailianPayloads[0].characterReference,"data:image/png;base64,skeleton");
assert.equal(bailianPayloads[1].characterReference,undefined);
let unexpectedSkeleton=false;
await runSingleGeneration(
  {text:"字",reference:"style",provider:"openai",style,existing:{}},
  {
    request: async payload => {
      assert.equal(payload.characterReference,undefined);
      return {image:"image:字"};
    },
    characterTemplate: async () => {unexpectedSkeleton=true;return "unused";},
    trace,
    progress: () => {},
  },
);
assert.equal(unexpectedSkeleton,false,"other providers must not fetch a skeleton");

console.log(
  "Single-character resume passed: partial failure, saved-image recovery, non-contiguous skip, restart after reload, all-done no requests, original glyph protection, old-image reuse, storage failure. No live AI calls.",
);
