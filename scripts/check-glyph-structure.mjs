import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const raw = await fs.readFile(new URL("../lib/font/glyph-structure-template.ts",import.meta.url),"utf8");
const fakeEngine = "data:text/javascript;base64," +
  Buffer.from("export async function loadBase(){return globalThis.__testFont;}").toString("base64");
const compiled = ts.transpileModule(raw.replace('from "./engine"', 'from "' + fakeEngine + '"'),{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText;
const {glyphStructureTemplate} = await import(
  "data:text/javascript;base64,"+Buffer.from(compiled).toString("base64")
);
const oldDocument=globalThis.document;
const oldFont=globalThis.__testFont;
const drawn = [];
globalThis.document={
  createElement(kind){
    assert.equal(kind,"canvas");
    return {
      getContext(type){
        assert.equal(type,"2d");
        return {fillRect(){},set fillStyle(value){drawn.push(value);}};
      },
      toDataURL(mime){assert.equal(mime,"image/png");return "data:image/png;base64,c3RydWN0dXJl";}
    };
  },
};
globalThis.__testFont={
  charToGlyphIndex:char=>char==="永"?1:0,
  charToGlyph:char=>({
    getPath(x,y,size){
      if(x===0 && y===0) return {getBoundingBox:()=>({x1:0,x2:200,y1:-350,y2:30})};
      assert.equal(size,390);
      assert.equal(x,156);
      assert.equal(y,416);
      return {set fill(value){assert.equal(value,"#111");},draw(ctx){drawn.push("glyph");}};
    },
  }),
};
try {
  const style={base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0};
  assert.match(await glyphStructureTemplate("永",style),/^data:image\/png;base64,/);
  assert.ok(drawn.includes("glyph"));
  assert.equal(await glyphStructureTemplate("乙",style),undefined);
  globalThis.__testFont=null;
  assert.equal(await glyphStructureTemplate("永",style),undefined);
  console.log("Bailian target-glyph structure template tests passed (mock browser/font only).");
} finally {
  if(oldDocument===undefined) delete globalThis.document; else globalThis.document=oldDocument;
  if(oldFont===undefined) delete globalThis.__testFont; else globalThis.__testFont=oldFont;
}
