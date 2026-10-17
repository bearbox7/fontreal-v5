import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SHEET,
  sheetLayout,
  DEFAULT_TEST_TEXT,
  testCharacters,
  limitTestText,
  previewRows,
  sheetSlots,
} from "../lib/font/sheet-layout.ts";
const chars = testCharacters(DEFAULT_TEST_TEXT),
  allowed = JSON.parse(
    fs.readFileSync(new URL("../public/fonts/charset.json", import.meta.url)),
  ).all;
assert.equal(chars.length, 72);
assert.ok(chars.every((c) => allowed.includes(c)));
const slots = sheetSlots(chars);
assert.equal(slots.length, 72);
assert.equal(slots[11].x, 11 / 12);
assert.equal(slots[11].y, 0);
assert.equal(slots[12].x, 0);
assert.equal(slots[12].y, 1 / 6);
assert.equal(slots[71].x, 11 / 12);
assert.equal(slots[71].y, 5 / 6);
assert.equal(slots[0].width * SHEET.width, 320);
assert.equal(slots[0].height * SHEET.height, 360);
assert.deepEqual(
  previewRows(DEFAULT_TEST_TEXT).map((r) => r.length),
  [12, 12, 12, 12, 12, 12],
);
assert.equal(
  testCharacters(limitTestText(DEFAULT_TEST_TEXT + "额外")).length,
  72,
);
assert.equal(testCharacters("字字\n生").length, 2);
assert.throws(() => sheetSlots(Array(73).fill("字")));
console.log(
  "72-cell layout verified: unique supported characters, 12x6 slots, 320x360 cells, text limit and preview",
);

const compact = sheetSlots(chars.slice(0, 32), sheetLayout(32));
assert.equal(compact.length, 32);
assert.equal(compact[31].x, 7 / 8);
assert.equal(compact[31].y, 3 / 4);
assert.equal(compact[0].width * 3840, 480);
assert.equal(compact[0].height * 2160, 540);
assert.equal(testCharacters(limitTestText(DEFAULT_TEST_TEXT, 32)).length, 32);
