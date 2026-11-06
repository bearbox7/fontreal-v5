import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

const compile = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleURL = (src) =>
  "data:text/javascript;base64," +
  Buffer.from(compile(src.replace('from "zod"', 'from "' + import.meta.resolve("zod") + '"'))).toString("base64");
let src = await fs.readFile(new URL("../lib/ai/providers/index.ts", import.meta.url), "utf8");
for (const name of ["font-analysis", "glyph-generation"]) {
  src = src.replace("@/prompts/" + name,
    moduleURL(await fs.readFile(new URL("../prompts/" + name + ".ts", import.meta.url), "utf8")));
}
for (const name of ["glyph-feedback", "glyph-mentions"]) {
  src = src.replace("@/lib/font/" + name,
    moduleURL(await fs.readFile(new URL("../lib/font/" + name + ".ts", import.meta.url), "utf8")));
}
const tmp = new URL("../work/grsai-provider-test.mjs", import.meta.url);
await fs.mkdir(new URL("../work/", import.meta.url), {recursive:true});
await fs.writeFile(tmp, compile(src));
const vars=["GRSAI_API_KEY","GRSAI_BASE_URL","GRSAI_IMAGE_MODEL","GRSAI_ANALYSIS_MODEL"];
const prior=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
const oldFetch=globalThis.fetch;
const style={base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0};
const dataImage="data:image/png;base64,aGVsbG8=";
try {
  Object.assign(process.env,{
    GRSAI_API_KEY:"mock-test-token",
    GRSAI_BASE_URL:"https://grsaiapi.com",
    GRSAI_IMAGE_MODEL:"gpt-image-2.6",
    GRSAI_ANALYSIS_MODEL:"gemini-3.1-pro"
  });
  const { generateGlyph, analyzeFont, providerStatus, ProviderError } = await import(tmp.href);
  assert.equal(providerStatus().grsai,true);
  let hits=0;
  globalThis.fetch=async(url,init)=>{
    hits++;
    assert.equal(String(url),"https://grsaiapi.com/v1/api/generate");
    assert.equal(init.method,"POST");
    assert.equal(init.headers.Authorization,"Bearer mock-test-token");
    const b=JSON.parse(init.body);
    assert.equal(b.model,"gpt-image-2.6");
    assert.equal(b.aspectRatio,"1024x1024");
    assert.equal(b.replyType,"json");
    assert.equal(b.images.length,1);
    assert.equal(b.images[0],dataImage);
    assert.match(b.prompt,/永/);
    return Response.json({id:"mock-task",status:"succeeded",results:[{content:dataImage}]});
  };
  let r=await generateGlyph("grsai","永",style,dataImage);
  assert.equal(r.model,"gpt-image-2.6");assert.equal(r.image,dataImage);assert.equal(hits,1);
  hits=0;
  globalThis.fetch=async (url,init)=>{
    hits++;
    assert.equal(String(url),"https://grsaiapi.com/v1/chat/completions");
    assert.equal(init.headers.Authorization,"Bearer mock-test-token");
    const b=JSON.parse(init.body);
    assert.equal(b.model,"gemini-3.1-pro");
    assert.equal(b.stream,false);
    assert.equal(b.messages[1].content[1].image_url.url,dataImage);
    return Response.json({choices:[{message:{content:JSON.stringify({
      description:"圆润黑体",category:"字体",tags:["圆润"],
      characters:[],style
    })}}]});
  };
  r=await analyzeFont("grsai",{prompt:"圆润的字体",image:dataImage});
  assert.equal(r.analysis.style.base,"sans");assert.equal(r.model,"gemini-3.1-pro");assert.equal(hits,1);
  hits=0;
  globalThis.fetch=async(url,init)=>{
    hits++;
    if(hits===1) return Response.json({id:"mock",status:"succeeded",results:[{url:"https://file1.aitohumanize.com/file/safe.png"}]});
    assert.equal(String(url),"https://file1.aitohumanize.com/file/safe.png");
    assert.equal(init.redirect,"error");
    return new Response(Buffer.from("fake-png"),{headers:{"content-type":"image/png"}});
  };
  r=await generateGlyph("grsai","永",style);
  assert.match(r.image,/^data:image\/png;base64,/);assert.equal(hits,2);
  globalThis.fetch=async()=>Response.json({status:"succeeded",results:[{url:"http://127.0.0.1/secret"}]});
  await assert.rejects(()=>generateGlyph("grsai","永",style),/安全白名单/);
  globalThis.fetch=async()=>Response.json({status:"running",id:"mock-task"});
  await assert.rejects(()=>generateGlyph("grsai","永",style),
    e=>e instanceof ProviderError&&e.status===504);
  globalThis.fetch=async()=>Response.json({code:429,msg:"额度不足"});
  await assert.rejects(()=>generateGlyph("grsai","永",style),
    e=>e instanceof ProviderError&&e.status===429);
  process.env.GRSAI_BASE_URL="https://evil.example";
  await assert.rejects(()=>generateGlyph("grsai","永",style),
    e=>e instanceof ProviderError&&e.status===503);
  process.env.GRSAI_BASE_URL="https://grsaiapi.com";
  delete process.env.GRSAI_API_KEY;
  assert.equal(providerStatus().grsai,false);
  await assert.rejects(()=>generateGlyph("grsai","永",style),
    e=>e instanceof ProviderError&&e.status===503);
  console.log("GrsAI provider mock tests passed: official endpoint, reference images, style analysis, base64/CDN output, SSRF guard, pending/429/invalid host/missing key.");
  console.log("No billable network calls; mock fetch only.");
} finally {
  globalThis.fetch=oldFetch;
  for(const k of vars){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
}
