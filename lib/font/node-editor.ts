import svgpath from "svgpath";
export type Vec = {x:number;y:number};
export type Anchor = Vec & {incoming?:Vec;outgoing?:Vec;smooth?:boolean};
export type Contour = {nodes:Anchor[];closed:boolean};
export type Outline = Contour[];
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const same=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y)<.001;
const lerp=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function readOutline(path:string):Outline {
  const parsed=svgpath(path).unshort().unarc().abs().matrix([1,0,0,-1,0,880]) as ReturnType<typeof svgpath> & {err:string;segments:[string,...number[]][]};
  parsed.toString();
  if(parsed.err)throw Error("无法编辑无效字形路径");
  const result:Outline=[];let contour:Contour|undefined;
  for(const [type,...p] of parsed.segments){
    if(type==='M'){contour={nodes:[{x:p[0],y:p[1]}],closed:false};result.push(contour);continue;}
    if(!contour)continue;
    const prev=contour.nodes.at(-1)!;
    if(type==='Z'){
      contour.closed=true;
      if(contour.nodes.length>1 && same(contour.nodes[0],prev)){contour.nodes[0].incoming=prev.incoming;contour.nodes.pop();}
    }else if(type==='C'){prev.outgoing={x:p[0],y:p[1]};contour.nodes.push({x:p[4],y:p[5],incoming:{x:p[2],y:p[3]}});}
    else if(type==='Q'){const end={x:p[2],y:p[3]},q={x:p[0],y:p[1]};prev.outgoing=lerp(prev,q,2/3);contour.nodes.push({...end,incoming:lerp(end,q,2/3)});}
    else if(type==='L')contour.nodes.push({x:p[0],y:p[1]});
    else if(type==='H')contour.nodes.push({x:p[0],y:prev.y});
    else if(type==='V')contour.nodes.push({x:prev.x,y:p[0]});
    else throw Error("不支持的字形节点类型");
  }
  for(const c of result)for(const n of c.nodes){
    if(n.incoming && n.outgoing){const a={x:n.incoming.x-n.x,y:n.incoming.y-n.y},b={x:n.outgoing.x-n.x,y:n.outgoing.y-n.y};n.smooth=Math.abs(a.x*b.y-a.y*b.x)<.01*Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)&&a.x*b.x+a.y*b.y<0;}
  }
  return result;
}
export function outlineSVG(outline:Outline){
  const v=(n:number)=>{if(!Number.isFinite(n))throw Error("节点坐标无效");return Math.round(n*1000)/1000;};
  const point=(p:Vec)=>`${v(p.x)} ${v(p.y)}`;
  return outline.map(c=>{
    if(!c.nodes.length)return '';
    let d=`M${point(c.nodes[0])}`;
    const count=c.nodes.length+(c.closed?1:0);
    for(let j=1;j<count;j++){const a=c.nodes[j-1],b=c.nodes[j%c.nodes.length];
      if(a.outgoing || b.incoming)d+=`C${point(a.outgoing||a)} ${point(b.incoming||b)} ${point(b)}`;
      else if(j<c.nodes.length)d+=`L${point(b)}`;
    }
    return d+(c.closed?'Z':'');
  }).join('');
}
export function writeOutline(outline:Outline){return svgpath(outlineSVG(outline)).matrix([1,0,0,-1,0,880]).round(3).toString();}
export function moveAnchor(outline:Outline,c:number,n:number,position:Vec):Outline {
  const next=copy(outline),node=next[c].nodes[n],dx=position.x-node.x,dy=position.y-node.y;
  node.x=position.x;node.y=position.y;
  for(const key of ['incoming','outgoing'] as const)if(node[key]){node[key]!.x+=dx;node[key]!.y+=dy;}
  return next;
}
export function moveHandle(outline:Outline,c:number,n:number,key:'incoming'|'outgoing',position:Vec,breakLink=false):Outline {
  const next=copy(outline),node=next[c].nodes[n],other=key==='incoming'?'outgoing':'incoming';
  if(breakLink)node.smooth=false;
  node[key]=position;
  if(node.smooth && node[other]){const length=Math.hypot(node[other]!.x-node.x,node[other]!.y-node.y),dx=position.x-node.x,dy=position.y-node.y,l=Math.hypot(dx,dy);if(l>1e-6)node[other]={x:node.x-dx/l*length,y:node.y-dy/l*length};}
  return next;
}
export function setAnchorMode(outline:Outline,c:number,n:number,mode:'smooth'|'corner'|'collapse'):Outline {
  const next=copy(outline),contour=next[c],node=contour.nodes[n];
  node.smooth=mode==='smooth';
  if(mode==='collapse'){delete node.incoming;delete node.outgoing;}
  if(mode==='smooth'){
    const prev=contour.nodes[(n-1+contour.nodes.length)%contour.nodes.length],after=contour.nodes[(n+1)%contour.nodes.length];
    let dx=after.x-prev.x,dy=after.y-prev.y,len=Math.hypot(dx,dy);if(len<1e-6){dx=1;dy=0;len=1;}
    const li=node.incoming?Math.hypot(node.incoming.x-node.x,node.incoming.y-node.y):Math.hypot(prev.x-node.x,prev.y-node.y)/3;
    const lo=node.outgoing?Math.hypot(node.outgoing.x-node.x,node.outgoing.y-node.y):Math.hypot(after.x-node.x,after.y-node.y)/3;
    if(contour.closed || n>0)node.incoming={x:node.x-dx/len*li,y:node.y-dy/len*li};
    if(contour.closed || n<contour.nodes.length-1)node.outgoing={x:node.x+dx/len*lo,y:node.y+dy/len*lo};
  }
  return next;
}
export function splitEdge(outline:Outline,c:number,n:number,t=.5):Outline {
  const next=copy(outline),contour=next[c],a=contour.nodes[n],b=contour.nodes[(n+1)%contour.nodes.length];
  if(!contour.closed && n===contour.nodes.length-1)return next;
  let inserted:Anchor;
  if(a.outgoing || b.incoming){const p=lerp(a,a.outgoing||a,t),q=lerp(a.outgoing||a,b.incoming||b,t),r=lerp(b.incoming||b,b,t),s=lerp(p,q,t),u=lerp(q,r,t),v=lerp(s,u,t);a.outgoing=p;b.incoming=r;inserted={...v,incoming:s,outgoing:u,smooth:true};}
  else inserted=lerp(a,b,t);
  contour.nodes.splice(n+1,0,inserted);return next;
}
export function deleteAnchor(outline:Outline,c:number,n:number):Outline {
  const next=copy(outline);if(next[c].nodes.length<=(next[c].closed?3:2))return next;
  next[c].nodes.splice(n,1);return next;
}
