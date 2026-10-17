/** Optional HTTPS Basic Auth for the whole studio. Set STUDIO_PASSWORD in hosting. */
import { NextRequest, NextResponse } from "next/server";
export function proxy(req:NextRequest){
  const password=process.env.STUDIO_PASSWORD;
  if(!password || req.nextUrl.pathname==="/api/health") return NextResponse.next();
  const raw=req.headers.get("authorization")||"";
  let candidate="";
  if(raw.startsWith("Basic ")){
    try{const pair=atob(raw.slice(6));if(pair.startsWith("designer:")) candidate=pair.slice(9);}catch{}
  }
  if(candidate===password) return NextResponse.next();
  return new NextResponse("需要工作室访问密码",{
    status:401,headers:{"WWW-Authenticate":'Basic realm="FontReal Studio"',"Cache-Control":"no-store"}
  });
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.svg).*)"]};
