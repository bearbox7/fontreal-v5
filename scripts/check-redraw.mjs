import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const compile = (src) => ts.transpileModule(src, {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL = (src) => 'data:text/javascript;base64,' + Buffer.from(compile(src.replace('from "zod"', `from "${import.meta.resolve("zod")}"`))).toString('base64');
let src = await fs.readFile(new URL('../lib/ai/providers/index.ts', import.meta.url), 'utf8');
for (const name of ['font-analysis','glyph-generation']) {
  const prompt = await fs.readFile(new URL(`../prompts/${name}.ts`,import.meta.url),'utf8');
  src = src.replace(`@/prompts/${name}`,moduleURL(prompt));
}
src = src.replace("@/lib/font/glyph-feedback", moduleURL(await fs.readFile(new URL("../lib/font/glyph-feedback.ts", import.meta.url),"utf8")));
src = src.replace("@/lib/font/glyph-mentions", moduleURL(await fs.readFile(new URL("../lib/font/glyph-mentions.ts", import.meta.url),"utf8")));
src = src.replace("@/lib/ai/grsai", moduleURL(`export class GrsaiError extends Error { constructor(message,status=502){super(message);this.status=status;} } export async function grsaiAnalyze(){throw Error("mock GrsAI not used");} export async function grsaiGenerate(){throw Error("mock GrsAI not used");}`));
const tmp = new URL('../work/redraw-provider-check.mjs',import.meta.url);
await fs.writeFile(tmp, compile(src));
const originalFetch = globalThis.fetch;
const vars = ['OPENAI_API_KEY','GEMINI_API_KEY','OPENAI_BASE_URL','OPENAI_IMAGE_MODEL','GEMINI_IMAGE_MODEL'];
const previous = Object.fromEntries(vars.map(k=>[k,process.env[k]]));
const style = {base:'sans',weight:600,width:100,roundness:0,slant:0,tracking:0};
const image = 'data:image/png;base64,aGVsbG8=';
try {
  process.env.OPENAI_API_KEY = 'mock'; process.env.GEMINI_API_KEY = 'mock'; process.env.OPENAI_BASE_URL = 'https://mock.invalid/v1';
  process.env.OPENAI_IMAGE_MODEL='mock-image';process.env.GEMINI_IMAGE_MODEL='mock-gemini';
  const {generateGlyph} = await import(tmp.href);
  let calls = 0;
  globalThis.fetch = async (url,init) => {
    calls++;
    assert.equal(url,'https://mock.invalid/v1/images/edits');
    assert.equal(init.body.getAll('image[]').length,2);
    assert.equal(init.body.get('size'),'1024x1024');
    assert.match(init.body.get('prompt'),/“幸”/);
    assert.match(init.body.get('prompt'),/补齐下方横画/);
    assert.match(init.body.get('prompt'),/Image 2 is the correct target glyph structure/);
    assert.match(init.body.get('prompt'),/Variation index: 24/);
    return Response.json({data:[{b64_json:'aGVsbG8='}]});
  };
  const result = await generateGlyph('openai','幸',style,image,24,'补齐下方横画',image);
  assert.equal(calls,1); assert.equal(result.image,image);
  globalThis.fetch = async (url,init) => {
    calls++;
    const payload = JSON.parse(init.body);
    assert.equal(payload.contents[0].parts.filter(x=>x.inlineData).length,1);
    assert.match(payload.contents[0].parts[0].text,/correct target glyph reference/);
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'aGVsbG8='}}]}}]});
  };
  await generateGlyph('gemini','幸',style,undefined,1,'修正笔画',image);
  assert.equal(calls,2);
  globalThis.fetch = async (url,init) => {
    calls++;assert.equal(init.body.getAll('image[]').length,3);
    assert.match(init.body.get('prompt'),/LAST attached image is the current glyph/);
    assert.match(init.body.get('prompt'),/Marker 1 at x=25.0%, y=75.0%: 补上一横/);
    assert.match(init.body.get('prompt'),/Remove all marker circles/);
    return Response.json({data:[{b64_json:'aGVsbG8='}]});
  };
  await generateGlyph('openai','幸',style,image,2,'',image,[{x:.25,y:.75,text:'补上一横'}],image);
  assert.equal(calls,3);
  globalThis.fetch=async(url,init)=>{
    const form=init.body;assert.equal(form.getAll('image[]').length,4);
    assert.match(form.get('prompt'),/CROSS-GLYPH REFERENCES: Image 3/);
    assert.match(form.get('prompt'),/U\+5B57 = “字”/);
    assert.match(form.get('prompt'),/LAST image is the current manually edited target glyph/);
    return Response.json({data:[{b64_json:'aGVsbG8='}]});
  };
  await generateGlyph('openai','幸',style,image,3,'参考 @字(U+5B57)',image,[],image,[{character:'字',code:'U+5B57'}],image);
  console.log('Mention reference images and manual target image prompt/order passed. Mock API only.');
  console.log('Redraw checks passed: custom corrections, reference ordering, Gemini reference-only, 1K single output, variations >20. Mock API only.');
} finally {
  globalThis.fetch = originalFetch;
  for (const k of vars) {if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];}
  await fs.unlink(tmp);
}
