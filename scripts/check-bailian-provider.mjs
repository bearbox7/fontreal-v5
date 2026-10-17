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
const tmp = new URL("../work/bailian-provider-check.mjs", import.meta.url);
await fs.writeFile(tmp, compile(src));
const vars = ["BAILIAN_API_KEY", "BAILIAN_BASE_URL", "BAILIAN_ANALYSIS_MODEL", "BAILIAN_IMAGE_MODEL"];
const prior = Object.fromEntries(vars.map(k => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
const style = {base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0};
const png = "data:image/png;base64,aGVsbG8=";
const cdn = "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/a.png?Expires=999";
try {
  process.env.BAILIAN_API_KEY = "mock-secret";
  process.env.BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com";
  process.env.BAILIAN_ANALYSIS_MODEL = "qwen3-vl-plus";
  process.env.BAILIAN_IMAGE_MODEL = "qwen-image-3.0";
  const { analyzeFont, generateGlyph, providerStatus } = await import(tmp.href);
  assert.equal(providerStatus().bailian, true);
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
      assert.equal(init.headers.Authorization, "Bearer mock-secret");
      const body = JSON.parse(init.body);
      assert.equal(body.model, "qwen-image-3.0");
      assert.equal(body.input.messages[0].content.filter(part => part.image).length, 2);
      assert.equal(body.input.messages[0].content.at(-1).text.includes("永"), true);
      assert.equal(body.parameters.size, "1024*1024");
      assert.equal(body.parameters.prompt_extend, false);
      return Response.json({output:{choices:[{message:{content:[{image:cdn}]}}]}});
    }
    assert.equal(url.toString(), cdn);
    assert.equal(init.redirect, "error");
    return new Response(Buffer.from("hello"), {headers:{"content-type":"image/png"}});
  };
  const result = await generateGlyph("bailian","永",style,png,0,"加强竖画",png);
  assert.equal(result.model,"qwen-image-3.0");
  assert.equal(result.image,png);
  assert.equal(calls,2);

  const analysis = {
    description:"黑体",category:"几何",tags:["方正"],characters:[],
    style: {base:"sans",weight:600,width:100,roundness:0,slant:0,tracking:0},
  };
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    assert.equal(init.headers.Authorization,"Bearer mock-secret");
    const payload=JSON.parse(init.body);
    assert.equal(payload.model,"qwen3-vl-plus");
    assert.equal(payload.response_format.type,"json_object");
    assert.equal(payload.messages[1].content.filter(x=>x.type==="image_url").length,1);
    return Response.json({choices:[{message:{content:JSON.stringify(analysis)}}]});
  };
  assert.equal((await analyzeFont("bailian",{image:png})).analysis.description,"黑体");

  globalThis.fetch=async()=>Response.json({code:"InvalidApiKey",message:"unauthorized"},{status:401});
  await assert.rejects(()=>generateGlyph("bailian","永",style),/鉴权失败/);

  globalThis.fetch=async()=>Response.json({
    output:{choices:[{message:{content:[{image:"https://example.invalid/secret.png"}]}}]},
  });
  await assert.rejects(()=>generateGlyph("bailian","永",style),/不受支持/);

  await assert.rejects(
    ()=>generateGlyph("bailian","永",style,png,0,"",png,[],png),
    /最多支持 3 张参考图/
  );
  process.env.BAILIAN_BASE_URL = "https://example.invalid";
  await assert.rejects(()=>generateGlyph("bailian","永",style),/接口地址无效/);

  console.log("Bailian provider checks passed: isolated configuration, vision analysis, image edits, signed-image persistence, auth and URL safety. Mock API only.");
} finally {
  globalThis.fetch = originalFetch;
  for (const name of vars) {
    if (prior[name] === undefined) delete process.env[name];
    else process.env[name] = prior[name];
  }
  await fs.unlink(tmp);
}
