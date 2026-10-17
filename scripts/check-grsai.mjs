import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const compile=(s)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modurl=(s)=>"data:text/javascript;base64,"+Buffer.from(compile(s)).toString("base64");
let src=await fs.readFile(new URL("../lib/ai/grsai.ts",import.meta.url),"utf8");
const prompt=await fs.readFile(new URL("../prompts/font-analysis.ts",import.meta.url),"utf8");
src=src.replace("@/prompts/font-analysis",modurl(prompt));
const tmp=new URL("../work/grsai-check.mjs",import.meta.url);
await fs.writeFile(tmp,compile(src));
const vars=["GRSAI_API_KEY","GRSAI_BASE_URL","GRSAI_ANALYSIS_MODEL","GRSAI_IMAGE_MODEL"];
const old=Object.fromEntries(vars.map(x=>[x,process.env[x]]));
const oldFetch=globalThis.fetch;
try {
  Object.assign(process.env,{
    GRSAI_API_KEY:"mock-grsai-only",
    GRSAI_BASE_URL:"https://grsaiapi.com",
    GRSAI_ANALYSIS_MODEL:"gemini-2.5-flash",
    GRSAI_IMAGE_MODEL:"gpt-image-2.5-flare",
  });
  const {grsaiAnalyze,grsaiGenerate}=await import(tmp.href);
  let calls=[];
  globalThis.fetch=async (url, init)=>{
    calls.push({url:String(url),init});
    if(String(url).endsWith("/v1/chat/completions")){
      assert.equal(init.headers.Authorization,"Bearer mock-grsai-only");
      const p=JSON.parse(init.body);
      assert.equal(p.model,"gemini-2.5-flash");
      assert.equal(p.messages[1].content[0].text,"中文书法风格");
      assert.equal(p.messages[1].content[1].image_url.url,"data:image/png;base64,aGVsbG8=");
      return Response.json({choices:[{message:{content:"{\"description\":\"测试\"}"}}]});
    }
    if(String(url).endsWith("/v1/api/generate")){
      assert.equal(init.headers.Authorization,"Bearer mock-grsai-only");
      const p=JSON.parse(init.body);
      assert.equal(p.model,"gpt-image-2.5-flare");
      assert.equal(p.replyType,"json");
      assert.equal(p.aspectRatio,"1024x1024");
      assert.deepEqual(p.images,["data:image/png;base64,aGVsbG8="]);
      return Response.json({status:"succeeded",results:[{url:"https://file1.aitohumanize.com/file/mock.png"}]});
    }
    if(String(url).includes("file1.aitohumanize.com")){
      assert.equal(init.redirect,"error");
      return new Response(Buffer.from("fakepng"),{headers:{"content-type":"image/png"}});
    }
    throw Error("Unexpected outbound URL "+url);
  };
  const analysis=await grsaiAnalyze({image:"data:image/png;base64,aGVsbG8=",prompt:"中文书法风格"});
  assert.equal(analysis.model,"gemini-2.5-flash");
  assert.equal(JSON.parse(analysis.text).description,"测试");
  const result=await grsaiGenerate("画一个中文的永字",["data:image/png;base64,aGVsbG8="]);
  assert.equal(result.model,"gpt-image-2.5-flare");
  assert.ok(result.image.startsWith("data:image/png;base64,"));
  assert.equal(calls.length,3);
  globalThis.fetch=async()=>Response.json({status:"succeeded",results:[{url:"https://evil.example/private"}]});
  await assert.rejects(()=>grsaiGenerate("test",[]),/图片地址未在安全白名单/);
  console.log("GrsAI adapter passed: independent auth, analysis, image generation, secure image URL rejection. Mock only; no paid calls.");
}finally{
  globalThis.fetch=oldFetch;
  for(const k of vars){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}
  await fs.unlink(tmp);
}
