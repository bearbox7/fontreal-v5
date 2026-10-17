import { glyphPath } from "./engine";
import { writeGlyphPath } from "./svg-path";
import type { GlyphEdits, StyleConfig } from "./types";
import type { GlyphFeedback } from "./glyph-feedback";
export async function feedbackImage(character: string, style: StyleConfig, edits: GlyphEdits, points: GlyphFeedback[]) {
  const path = writeGlyphPath(await glyphPath(character, style, edits));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="white"/><g transform="translate(0 880) scale(1 -1)"><path d="${path}" fill="black"/></g></svg>`;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], {type:"image/svg+xml"}));
  try {
    await new Promise<void>((resolve, reject) => { img.onload=()=>resolve(); img.onerror=()=>reject(Error("无法读取当前字形")); img.src=url; });
    const canvas = document.createElement("canvas"); canvas.width=1024; canvas.height=1024;
    const ctx = canvas.getContext("2d"); if (!ctx) throw Error("浏览器无法建立字形画布");
    ctx.drawImage(img,0,0,1024,1024);
    points.forEach((point,i) => {
      const x=point.x*1024,y=point.y*1024;
      ctx.beginPath(); ctx.arc(x,y,23,0,Math.PI*2); ctx.fillStyle="#f46b40";ctx.fill();
      ctx.strokeStyle="white";ctx.lineWidth=3;ctx.stroke();
      ctx.font="bold 26px sans-serif";ctx.fillStyle="white";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(i+1),x,y+1);
    });
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
export async function glyphReferenceImage(characters: string[], style: StyleConfig, edits: GlyphEdits) {
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("无法建立引用字形画布");
  ctx.fillStyle="white";ctx.fillRect(0,0,1024,1024);
  for(let i=0;i<characters.length;i++){
    const src=await feedbackImage(characters[i],style,edits,[]);
    const image=new Image();image.src=src;await image.decode();
    const x=(i%2)*512,y=Math.floor(i/2)*512;
    ctx.drawImage(image,x+24,y+12,464,464);
    ctx.fillStyle="black";ctx.font="22px monospace";ctx.textAlign="center";ctx.fillText(`U+${characters[i].codePointAt(0)!.toString(16).toUpperCase().padStart(4,"0")}`,x+256,y+500);
  }
  return canvas.toDataURL("image/png");
}
