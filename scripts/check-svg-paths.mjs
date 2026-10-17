import assert from "node:assert/strict";
import * as ot from "../node_modules/opentype.js/dist/opentype.mjs";
import { readGlyphPath, writeGlyphPath } from "../lib/font/svg-path.ts";
const p = readGlyphPath("M0 0L10 0 10 10 0 10Z", ot.Path);
assert.deepEqual(
  p.commands.map((c) => c.type),
  ["M", "L", "L", "L", "Z"],
);
assert.deepEqual(p.commands[3], { type: "L", x: 0, y: 10 });
const c = readGlyphPath("M0 0C10 0 10 10 20 10 30 10 30 20 40 20Z", ot.Path);
assert.equal(c.commands.filter((c) => c.type === "C").length, 2);
assert.equal(c.commands[2].x, 40);
for (const d of [
  "M0 0l10 0 0 10 -10 0z",
  "M0 0L10 0 10 10 0 10Z M2 2L2 8 8 8 8 2Z",
  c.toPathData(3),
]) {
  const original = readGlyphPath(d, ot.Path);
  assert.deepEqual(
    readGlyphPath(original.toPathData(3), ot.Path).commands,
    original.commands,
  );
}
console.log(
  "SVG path regression checks passed: repeated L/C, relative coordinates, holes and serialization round trip",
);

const tiny = new ot.Path();
tiny.moveTo(0, 0);
tiny.bezierCurveTo(1e-14, 2, 3, -1e-14, 4, 5);
tiny.close();
assert.ok(!writeGlyphPath(tiny).includes("NaN"));
assert.ok(
  readGlyphPath(writeGlyphPath(tiny), ot.Path).commands.every((c) =>
    Object.values(c).every((n) => typeof n !== "number" || Number.isFinite(n)),
  ),
);
