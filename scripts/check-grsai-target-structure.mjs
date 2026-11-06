import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const transpile = (src) => ts.transpileModule(src,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText;
const moduleURL=(source)=>"data:text/javascript;base64,"+Buffer.from(transpile(source)).toString("base64");
const reference="data:image/png;base64,c3R5bGU=";
const skeleton="data:image/png;base64,c3RydWN0dXJl";
const style={base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0};
const path="M0 0L20 0L20 20Z";
const requests=[];
const originalRequest=globalThis.__grsaiTestRequest;
const originalTemplate=globalThis.__grsaiTestTemplate;
globalThis.__grsaiTestRequest=async payload=>{
  requests.push(payload);
  return {image:"data:image/png;base64,Z2VuZXJhdGVk",model:"mock-model"};
};
globalThis.__grsaiTestTemplate=async (c,config)=>{
  assert.equal(c,"林");assert.equal(config,style);
  return skeleton;
};
try {
  const testCode=await fs.readFile(new URL("../lib/font/ai-test.ts",import.meta.url),"utf8");
  const singleCode=await fs.readFile(new URL("../lib/font/single-generation.ts",import.meta.url),"utf8");
  const mocks={
    "./engine": moduleURL('export async function vectorizeDetailed(){return {path:"'+path+'",nodes:3,fidelity:.99,tolerance:1};}'),
    "./glyph-request":moduleURL('export async function requestGlyph(payload){return globalThis.__grsaiTestRequest(payload);}'),
    "./single-generation":moduleURL(singleCode),
    "./glyph-structure-template":moduleURL('export async function glyphStructureTemplate(c,config){return globalThis.__grsaiTestTemplate(c,config);}'),
  };
  let modified=testCode;
  for (const [name,url] of Object.entries(mocks))modified=modified.replace('from "'+name+'"','from "'+url+'"');
  const {generateTestGlyphs}=await import(moduleURL(modified));
  const run=async (provider)=>generateTestGlyphs("林",reference,provider,style,{},()=>{});
  const result=await run("grsai");
  assert.equal(result["林"].path,path);
  assert.equal(requests.length,1);
  assert.equal(requests[0].provider,"grsai");
  assert.equal(requests[0].character,"林");
  assert.equal(requests[0].image,reference);
  assert.equal(requests[0].characterReference,skeleton);
  requests.length=0;
  await run("bailian");
  assert.equal(requests.length,1);
  assert.equal(requests[0].characterReference,skeleton);
  requests.length=0;
  await run("openai");
  assert.equal(requests.length,1);
  assert.equal(requests[0].characterReference,undefined);
  console.log("GrsAI style image + target character structure regression PASSED: request for 林 includes distinct style and structure references. Bailian and OpenAI behavior preserved; no external model call.");
} finally {
  if(originalRequest===undefined)delete globalThis.__grsaiTestRequest;else globalThis.__grsaiTestRequest=originalRequest;
  if(originalTemplate===undefined)delete globalThis.__grsaiTestTemplate;else globalThis.__grsaiTestTemplate=originalTemplate;
}
