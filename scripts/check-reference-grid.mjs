import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  planReferenceGrid,
  findGridInkBounds,
  previewReferenceGrid,
} from "../lib/font/reference-grid.ts";

const label = "今国意我永然警转酬随风鹰宋体提印要汝好字";
const plan = planReferenceGrid(label, 10, 2);
assert.equal(plan.length, 20);
assert.deepEqual(plan[0], {character:"今",index:0,row:0,column:0});
assert.deepEqual(plan[9], {character:"随",index:9,row:0,column:9});
assert.deepEqual(plan[10],{character:"风",index:10,row:1,column:0});
assert.deepEqual(plan[19],{character:"字",index:19,row:1,column:9});
assert.throws(()=>planReferenceGrid(label, 9,2),/应对应 18 个字/);
assert.throws(()=>planReferenceGrid("字字", 2,1),/重复/);
assert.throws(()=>planReferenceGrid("字", 0,1),/1–24/);
assert.throws(()=>planReferenceGrid("字", 1,0),/1–24/);

const width=100,height=80;
const rgba = new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++) for(let x=0;x<width;x++){
  const n=(y*width+x)*4;
  rgba[n]=rgba[n+1]=rgba[n+2]=255;rgba[n+3]=255;
}
for(let y=10;y<68;y++)for(let x=15;x<84;x++){
  const n=(y*width+x)*4;rgba[n]=rgba[n+1]=rgba[n+2]=0;
}
// Black border pixels must not extend the detected glyph bounds.
for(let x=0;x<width;x++){const n=x*4;rgba[n]=rgba[n+1]=rgba[n+2]=0;}
assert.deepEqual(findGridInkBounds(rgba,width,height),{
  x:15,y:10,width:69,height:58,ink:69*58,
});
assert.equal(findGridInkBounds(new Uint8ClampedArray(width*height*4).fill(255),width,height),undefined);

const priorImage=globalThis.Image,priorDocument=globalThis.document;
let count=0,rawCropCount=0;
globalThis.Image=class {
  naturalWidth=1400;
  naturalHeight=350;
  async decode() {}
};
globalThis.document={
  createElement(kind) {
    assert.equal(kind,"canvas");
    const canvas={width:0,height:0};
    const ctx={
      fillStyle:"#fff",
      fillRect(){},
      drawImage(...args){
        if(args.length===9 && args[0] instanceof globalThis.Image){
          assert.equal(args[3],140);
          assert.equal(args[4],175);
          rawCropCount++;
        }
      },
      getImageData(){
        const pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
          const n=(y*canvas.width+x)*4;
          const black=x>12&&x<canvas.width-12&&y>12&&y<canvas.height-12;
          pixels[n]=pixels[n+1]=pixels[n+2]=black?0:255;
          pixels[n+3]=255;
        }
        return {data:pixels};
      }
    };
    return Object.assign(canvas,{
      getContext(){return ctx;},
      toDataURL(){return "data:image/png;base64,"+Buffer.from("sample-"+(++count)).toString("base64");}
    });
  }
};
try {
  const actual=await previewReferenceGrid("data:image/png;base64,aGVsbG8=",label,10,2);
  assert.equal(actual.length,20);
  assert.equal(rawCropCount,20);
  assert.equal(actual[0].character,"今");
  assert.equal(actual[19].character,"字");
  assert.equal(new Set(actual.map(x=>x.image)).size,20);
} finally {
  if (priorImage===undefined) delete globalThis.Image;else globalThis.Image=priorImage;
  if (priorDocument===undefined) delete globalThis.document;else globalThis.document=priorDocument;
}
const studio=await fs.readFile(new URL("../components/studio.tsx",import.meta.url),"utf8");
assert.match(studio,/原样描摹导入/);
assert.match(studio,/尚有.*字未生成/);
assert.match(studio,/await vectorizeDetailed\(cell\.image\)/);
assert.match(studio,/model: "reference-grid-extract"/);
console.log("Reference-grid extraction passed: exact 10x2 character mapping, safe bounding boxes, preview gating, generated glyph trace integration. Mock browser only.");
