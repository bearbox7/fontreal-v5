import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
export const runtime = "nodejs";
export const maxDuration = 45;
const MAX = 15 * 1024 * 1024;
const extensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".ai", ".eps", ".ttf", ".otf"]);
const recentRequests = new Map<string, number[]>();
export async function POST(request: NextRequest) {
  const origin=request.headers.get("origin");
  if(origin && origin !== request.nextUrl.origin) return NextResponse.json({error:"不允许跨站上传"},{status:403});
  const client=request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now=Date.now();
  const list=(recentRequests.get(client)||[]).filter(t=>now-t<60_000);
  if(list.length>=8) return NextResponse.json({error:"上传频率超出限制"},{status:429});
  recentRequests.set(client,[...list,now]);
  if(recentRequests.size>300) for(const [key,times] of recentRequests) if(times.at(-1)!<now-60_000) recentRequests.delete(key);
  if(Number(request.headers.get("content-length"))>MAX+30_000) return NextResponse.json({error:"素材不得超过 15 MB"},{status:413});
  let form:FormData;
  try{form=await request.formData();}catch{return NextResponse.json({error:"表单数据无效"},{status:400});}
  const file=form.get("file"), character=String(form.get("char")||"永");
  if(!(file instanceof File)) return NextResponse.json({error:"请选择文件"},{status:400});
  if(Array.from(character).length!==1)return NextResponse.json({error:"每次导入一个汉字"},{status:400});
  const ext=path.extname(file.name).toLowerCase();
  if(!extensions.has(ext))return NextResponse.json({error:"文件格式不受支持"},{status:400});
  if(file.size<8||file.size>MAX)return NextResponse.json({error:"文件大小须为 8 字节至 15 MB"},{status:413});
  const data=Buffer.from(await file.arrayBuffer());
  try{
    const output=await new Promise<string>((resolve,reject)=>{
      const child=spawn("python3",[path.join(process.cwd(),"server_tools","import_cli.py"),ext,character],{
        cwd:path.join(process.cwd(),"server_tools"),shell:false,
        env:{NODE_ENV:process.env.NODE_ENV||"production",PATH:process.env.PATH||"/usr/local/bin:/usr/bin:/bin",HOME:"/tmp",PYTHONUNBUFFERED:"1"},
        stdio:["pipe","pipe","pipe"]
      });
      let text="";
      const timer=setTimeout(()=>{child.kill("SIGKILL");reject(Error("文件转换超时"));},38000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data",(piece:string)=>{text+=piece;if(text.length>3_000_000)child.kill("SIGKILL");});
      child.stderr.on("data",()=>{});
      child.on("error",e=>{clearTimeout(timer);reject(e);});
      child.on("close",code=>{clearTimeout(timer);if(text.trim())resolve(text);else reject(Error(code===0?"转换结果为空":"转换程序未正确启动"));});
      child.stdin.on("error",()=>{});
      child.stdin.end(data);
    });
    const result=JSON.parse(output);
    return NextResponse.json(result,{status:result.ok?200:422});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:422});}
}
