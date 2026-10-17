import assert from "node:assert/strict";
import {
  serializeProject,
  parseProjectFile,
  projectFilename,
} from "../lib/font/project-file.ts";
const style = {
  base: "sans",
  weight: 600,
  width: 100,
  roundness: 0,
  slant: 0,
  tracking: 0,
};
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=";
const slot = { character: "新", index: 0, x: 0, y: 0, width: 1, height: 1 };
const sheet = {
  image,
  width: 1024,
  height: 1024,
  model: "fixture",
  prompt: "fixture",
  createdAt: "2026-10-16T00:00:00Z",
  layout: { columns: 1, rows: 1, capacity: 1 },
  cells: [{ character: "新", image, warning: "", slot }],
};
const signature = {
  style,
  reference: image,
  testText: "字新",
  provider: "openai",
  batchMode: true,
  sheetCapacity: 32,
  id: "original-id",
};
const source = {
  ...signature,
  name: "迁移检查字体",
  prompt: "圆润、有力",
  analysis: null,
  sheets: [sheet],
  sheetStamp: JSON.stringify(signature),
  edits: {
    字: {
      scale: 103,
      rotate: 2,
      x: 1,
      y: -2,
      version: 2,
      path: "M10 10C20 30 40 50 60 70Z",
      sourceImage: image,
      manuallyEdited: true,
      redrawComments: [{x:0.3,y:0.8,text:"补上一横"}],
      redrawPrompt: "补齐横画，保持完整结构",
      redrawReference: image,
      model: "fixture",
      generatedStyle: style,
      traceStats: { nodes: 5, fidelity: 0.995, tolerance: 1 },
    },
  },
  expansion: {
    scope: "custom",
    quantity: 72,
    customText: "新生",
    mode: "sheet",
    capacity: 72,
    pending: {
      id: "batch-1",
      characters: ["新", "生"],
      mode: "single",
      capacity: 32,
      provider: "openai",
      style,
      reference: image,
      createdAt: "2026-10-16T00:00:00Z",
      sheets: [sheet],
    },
    history: [],
  },
  preview: { sample: "字新", size: 56, space: 1, line: 1.7, dark: false },
  updatedAt: 1,
  OPENAI_API_KEY: "must-not-export",
  randomExtra: "strip",
};
const serialized = serializeProject(source);
assert.ok(
  !serialized.includes("must-not-export") &&
    !serialized.includes("randomExtra"),
);
const imported = parseProjectFile(serialized, "new-id");
assert.equal(imported.id, "new-id");
assert.deepEqual(imported.edits, source.edits);
assert.equal(imported.reference, image);
assert.deepEqual(imported.expansion, source.expansion);
assert.deepEqual(imported.preview, source.preview);
assert.equal(JSON.parse(imported.sheetStamp).id, "new-id");
assert.equal(source.id, "original-id");
assert.equal(source.edits.字.version, 2);
const recoverable = {
  ...source,
  edits: {
    ...source.edits,
    字: {
      ...source.edits.字,
      pendingGeneration: {
        image,
        model: "fixture",
        prompt: "fixture",
        createdAt: "2026-10-16T00:00:00Z",
        style,
      },
    },
  },
};
const pendingCopy = parseProjectFile(
  serializeProject(recoverable),
  "pending-copy",
);
assert.equal(pendingCopy.edits.字.path, source.edits.字.path);
assert.equal(pendingCopy.edits.字.pendingGeneration.image, image);
const stale = parseProjectFile(
  serializeProject({ ...source, testText: "不同" }),
  "new-id",
);
assert.equal(stale.sheetStamp, "");
assert.throws(() => parseProjectFile("not JSON", "copy"), /JSON/);
assert.throws(
  () =>
    parseProjectFile(
      JSON.stringify({ ...JSON.parse(serialized), version: 9 }),
      "copy",
    ),
  /版本/,
);
assert.throws(
  () => serializeProject({ ...source, style: { ...style, width: 999 } }),
  /无效数据/,
);
assert.throws(
  () =>
    parseProjectFile(
      serialized.replace(image, "https://unknown.example/image.png"),
      "copy",
    ),
  /格式/,
);
assert.equal(projectFilename("我的/字体:测试"), "我的-字体-测试.zifang.json");
const legacy = parseProjectFile(
  JSON.stringify({
    name: source.name,
    style,
    edits: source.edits,
    analysis: null,
  }),
  "legacy-copy",
);
assert.deepEqual(legacy.edits, source.edits);
assert.equal(legacy.id, "legacy-copy");
assert.equal(legacy.reference, "");
assert.equal(legacy.testText, "字");
console.log(
  "Project-file checks passed: glyph/image/parameters/pending-batch round trip, new copy ID, valid sheet signature migration, invalid input rejection and unrecognized secret-field removal.",
);
