import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(compile(s)).toString('base64');
let source=await fs.readFile(new URL('../lib/font/redraw.ts',import.meta.url),'utf8');
source=source.replace('./glyph-request',new URL('../lib/font/glyph-request.ts',import.meta.url).href);
source=source.replace('./glyph-mentions',url(await fs.readFile(new URL('../lib/font/glyph-mentions.ts',import.meta.url),'utf8')));
source=source.replace('from "./glyph-feedback"','from '+JSON.stringify(url((await fs.readFile(new URL('../lib/font/glyph-feedback.ts',import.meta.url),'utf8')).replace('from "zod"',`from "${import.meta.resolve('zod')}"`))));
source=source.replace('./engine',url('export async function vectorizeDetailed(){return {path:"M0 0L10 0L10 10Z",nodes:3,fidelity:.99,tolerance:1};}'));
source=source.replace('./glyph-feedback-image',url('export async function feedbackImage(c,s,e,p){if(!e[c].manuallyEdited)throw Error("missing manual outline");return "data:image/png;base64,bWFudWFs";} export async function glyphReferenceImage(chars,s,e){if(chars[0]!=="幸" || !e["幸"].path)throw Error("wrong glyph resolution");return "data:image/png;base64,cmVm";}'));
const {redrawGlyph}=await import(url(source));
const originalFetch=globalThis.fetch;
const style={base:'sans',weight:600,width:100,roundness:0,slant:0,tracking:0};
const edit={scale:100,rotate:0,x:0,y:0,version:2,path:'M0 0L1 0L1 1Z',manuallyEdited:true,redrawPrompt:'末端参考 @幸(U+5E78)'};
const existing={字:edit,幸:{...edit,manuallyEdited:false}};
let requests=0,checkpoint;
try{
 globalThis.fetch=async(endpoint,options)=>{requests++;const p=JSON.parse(options.body);assert.deepEqual(p.glyphReferences,[{character:'幸',code:'U+5E78'}]);assert.equal(p.annotationImage,'data:image/png;base64,bWFudWFs');assert.equal(p.glyphReferenceImage,'data:image/png;base64,cmVm');return Response.json({image:'data:image/png;base64,Z2VuZXJhdGVk',model:'mock',prompt:'mock',createdAt:'2026-10-16'});};
 const input={character:'字',style,edits:existing,reference:'',provider:'openai',glyphCharacters:'字幸',checkpoint:async e=>{checkpoint=e;}};
 const result=await redrawGlyph(input);
 assert.equal(requests,1);assert.ok(checkpoint.pendingGeneration);assert.equal(checkpoint.path,edit.path);assert.equal(result.manuallyEdited,false);assert.equal(result.redrawPrompt,edit.redrawPrompt);assert.equal(existing.字.path,edit.path);
 await assert.rejects(()=>redrawGlyph({...input,edits:{...existing,字:{...edit,redrawPrompt:'参考 @幸(U+5B57)'}}}),/无法在当前字库定位/);
 assert.equal(requests,1);
 const recovered=await redrawGlyph({...input,edits:{...existing,字:checkpoint}});
 assert.equal(requests,1);assert.equal(recovered.path,result.path);
 console.log('Redraw flow passed: manual outline + stable glyph references in one request, pre-trace checkpoint, invalid reference blocks paid request, pending image reused. Mock renderer/API only.');
} finally{globalThis.fetch=originalFetch;}
