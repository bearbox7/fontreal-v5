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
const file = new URL("../work/ai-paths-mock-check.mjs", import.meta.url);
await fs.writeFile(file, compile(src));
const vars = [
  "OPENAI_API_KEY","OPENAI_BASE_URL","OPENAI_IMAGE_MODEL","OPENAI_ANALYSIS_MODEL",
  "GEMINI_API_KEY","GEMINI_IMAGE_MODEL","GEMINI_ANALYSIS_MODEL",
  "BAILIAN_API_KEY","BAILIAN_BASE_URL","BAILIAN_IMAGE_MODEL","BAILIAN_ANALYSIS_MODEL"
];
const prior = Object.fromEntries(vars.map(k=>[k,process.env[k]]));
const priorFetch=globalThis.fetch;
const style={base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0};
const fakePNG="data:image/png;base64,aGVsbG8=";
let checks=0;
try {
  Object.assign(process.env,{
    OPENAI_API_KEY:"mock-only-not-real",
    OPENAI_BASE_URL:"https://api.openai.com/v1",
    OPENAI_IMAGE_MODEL:"gpt-image-2",
    OPENAI_ANALYSIS_MODEL:"gpt-4.1-mini",
    GEMINI_API_KEY:"mock-only-not-real",
    GEMINI_IMAGE_MODEL:"gemini-3.1-flash-image",
    GEMINI_ANALYSIS_MODEL:"gemini-3.6-flash",
    BAILIAN_API_KEY:"mock-only-not-real",
    BAILIAN_BASE_URL:"https://dashscope.aliyuncs.com",
    BAILIAN_IMAGE_MODEL:"qwen-image-3.0",
    BAILIAN_ANALYSIS_MODEL:"qwen3-vl-plus"
  });
  const {generateGlyph,providerStatus,ProviderError}=await import(file.href);
  assert.deepEqual(providerStatus(),{openai:true,gemini:true,bailian:true});
  checks++;
  let calls=[];
  globalThis.fetch=async (url,init)=>{
    calls.push(String(url));
    assert.equal(String(url),"https://api.openai.com/v1/images/generations");
    assert.equal(init.method,"POST");
    assert.equal(init.headers.Authorization,"Bearer mock-only-not-real");
    const b=JSON.parse(init.body);
    assert.equal(b.model,"gpt-image-2");
    assert.equal(b.size,"1024x1024");
    assert.ok(b.prompt.includes("永"));
    return Response.json({data:[{b64_json:"aGVsbG8="}]});
  };
  let r=await generateGlyph("openai","永",style);
  assert.equal(r.image,fakePNG);
  assert.equal(r.model,"gpt-image-2");
  assert.equal(calls.length,1);
  checks++;
  calls=[];
  globalThis.fetch=async (url,init)=>{
    calls.push(String(url));
    assert.equal(String(url),"https://api.openai.com/v1/images/edits");
    assert.equal(init.method,"POST");
    assert.equal(init.headers.Authorization,"Bearer mock-only-not-real");
    assert.equal(init.body.get("model"),"gpt-image-2");
    assert.equal(init.body.getAll("image[]").length,1);
    assert.ok(init.body.get("prompt").includes("永"));
    return Response.json({data:[{b64_json:"aGVsbG8="}]});
  };
  r=await generateGlyph("openai","永",style,fakePNG);
  assert.equal(r.image,fakePNG);
  assert.equal(calls.length,1);
  checks++;
  calls=[];
  globalThis.fetch=async (url,init)=>{
    calls.push(String(url));
    assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-3\.1-flash-image:generateContent$/);
    assert.equal(init.headers["x-goog-api-key"],"mock-only-not-real");
    const b=JSON.parse(init.body);
    assert.equal(b.generationConfig.responseModalities[1],"IMAGE");
    assert.match(b.contents[0].parts[0].text,/永/);
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:"image/png",data:"aGVsbG8="}}]}}]});
  };
  r=await generateGlyph("gemini","永",style);
  assert.equal(r.image,fakePNG);
  assert.equal(r.model,"gemini-3.1-flash-image");
  assert.equal(calls.length,1);
  checks++;
  calls=[];
  const oss="https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/test.png?Expires=999";
  globalThis.fetch=async (url,init)=>{
    calls.push(String(url));
    if(calls.length===1){
      assert.equal(String(url),"https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
      assert.equal(init.headers.Authorization,"Bearer mock-only-not-real");
      const b=JSON.parse(init.body);
      assert.equal(b.model,"qwen-image-3.0");
      assert.equal(b.parameters.size,"1024*1024");
      assert.match(b.input.messages[0].content.at(-1).text,/永/);
      return Response.json({output:{choices:[{message:{content:[{image:oss}]}}]}});
    }
    assert.equal(String(url),oss);
    return new Response(Buffer.from("hello"),{headers:{"content-type":"image/png"}});
  };
  r=await generateGlyph("bailian","永",style);
  assert.equal(r.image,fakePNG);
  assert.equal(r.model,"qwen-image-3.0");
  assert.equal(calls.length,2);
  checks++;
  globalThis.fetch=async()=>Response.json({error:{message:"mock quota exhausted"}},{status:429});
  await assert.rejects(
    ()=>generateGlyph("openai","永",style),
    e=>e instanceof ProviderError&&e.status===429&&/额度不足/.test(e.message)
  );
  checks++;
  process.env.OPENAI_API_KEY="";
  assert.equal(providerStatus().openai,false);
  await assert.rejects(
    ()=>generateGlyph("openai","永",style),
    e=>e instanceof ProviderError&&e.status===503&&/尚未配置/.test(e.message)
  );
  checks++;
  console.log("AI mock-path validation: "+checks+" checks passed.");
  console.log("Covered OpenAI images/generations + edits, Gemini image, Bailian image with OSS fetch, credentials status, 429 and missing-key behavior.");
  console.log("NO external AI requests: global fetch was replaced. NO charge incurred.");
} finally {
  globalThis.fetch=priorFetch;
  for(const k of vars){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
}
