"use client";
import { useRef,useState,type PointerEvent } from "react";
import { X,Undo2,Redo2 } from "lucide-react";
import { readOutline,outlineSVG,writeOutline,moveAnchor,moveHandle,setAnchorMode,splitEdge,deleteAnchor,type Outline,type Vec } from "@/lib/font/node-editor";
export default function NodeEditor({path,onApply,onClose}:{path:string;onApply:(path:string,nodes:number)=>void;onClose:()=>void}){
  const [outline,setOutline]=useState<Outline>(()=>readOutline(path));
  const [selected,select]=useState<{c:number;n:number}|null>(null),[zoom,Z]=useState(70);
  const [undo,U]=useState<Outline[]>([]),[redo,R]=useState<Outline[]>([]);
  const svg=useRef<SVGSVGElement|null>(null);
  const drag=useRef<{before:Outline;c:number;n:number;part:'anchor'|'incoming'|'outgoing';start:Vec;origin:Vec;moved:boolean}|null>(null);
  function commit(next:Outline){if(outlineSVG(next)===outlineSVG(outline) && JSON.stringify(next)===JSON.stringify(outline))return;U(h=>[...h.slice(-49),outline]);R([]);setOutline(next);}
  function point(e:{clientX:number;clientY:number}):Vec{const matrix=svg.current!.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y};}
  function start(e:PointerEvent<SVGElement>,c:number,n:number,part:'anchor'|'incoming'|'outgoing'){
    e.preventDefault();e.stopPropagation();select({c,n});svg.current?.focus();svg.current?.setPointerCapture(e.pointerId);
    const node=outline[c].nodes[n];drag.current={before:outline,c,n,part,start:point(e),origin:part==='anchor'?{x:node.x,y:node.y}:node[part]!,moved:false};
  }
  function finish(){const d=drag.current;if(d?.moved){U(h=>[...h.slice(-49),d.before]);R([]);}drag.current=null;}
  const node=selected?outline[selected.c]?.nodes[selected.n]:undefined;
  const count=outline.reduce((sum,c)=>sum+c.nodes.length,0);
  return <div className="overlay node-overlay" onClick={e=>{e.stopPropagation();onClose();}}><section className="modal node-editor" role="dialog" aria-modal="true" aria-label="字形节点编辑器" onClick={e=>e.stopPropagation()}>
    <button className="close" aria-label="关闭节点编辑器" onClick={onClose}><X size={18}/></button>
    <div className="eyebrow">BEZIER EDITOR</div><h2>精修每一道曲线</h2>
    <div className="node-toolbar"><button disabled={!undo.length} onClick={()=>{R(h=>[...h,outline]);setOutline(undo.at(-1)!);U(h=>h.slice(0,-1));select(null);}}><Undo2 size={14}/>撤销</button><button disabled={!redo.length} onClick={()=>{U(h=>[...h,outline]);setOutline(redo.at(-1)!);R(h=>h.slice(0,-1));select(null);}}><Redo2 size={14}/>重做</button><label>缩放 <select aria-label="节点画布缩放" value={zoom} onChange={e=>Z(+e.target.value)}>{[50,70,100,150,200,300,400].map(z=><option key={z} value={z}>{z}%</option>)}</select></label><span>{count} 个锚点</span></div>
    <div className="node-layout"><div className="node-viewport"><svg ref={svg} className="node-stage" style={{width:zoom*5,height:zoom*5}} viewBox="0 0 1000 1000" tabIndex={0} role="application" aria-label="拖动锚点与手柄调整字形" onPointerMove={e=>{const d=drag.current;if(!d)return;const p=point(e),next={x:d.origin.x+p.x-d.start.x,y:d.origin.y+p.y-d.start.y};d.moved=true;const value=d.part==='anchor'?moveAnchor(d.before,d.c,d.n,next):moveHandle(d.before,d.c,d.n,d.part,next,e.altKey);setOutline(value);}} onPointerUp={finish} onPointerCancel={()=>{if(drag.current)setOutline(drag.current.before);drag.current=null;}} onKeyDown={e=>{if(!selected||!node)return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();commit(deleteAnchor(outline,selected.c,selected.n));select(null);}else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const step=e.shiftKey?10:1;commit(moveAnchor(outline,selected.c,selected.n,{x:node.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),y:node.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)}));}}}>
      <rect width="1000" height="1000" fill="#fff"/><path d="M0 500H1000M500 0V1000" stroke="#e2e6d8" strokeWidth="2"/><path d={outlineSVG(outline)} fill="#3e4d30" fillRule="nonzero" stroke="#b0bc9d" strokeWidth="1"/>
      {outline.flatMap((c,ci)=>c.nodes.map((n,ni)=><g key={`${ci}-${ni}`}>
        {selected?.c===ci&&selected.n===ni&&(['incoming','outgoing'] as const).map(part=>n[part]&&<g key={part}><line x1={n.x} y1={n.y} x2={n[part]!.x} y2={n[part]!.y} stroke="#ed754b" strokeWidth={150/zoom}/><circle cx={n[part]!.x} cy={n[part]!.y} r={650/zoom} fill="white" stroke="#ed754b" strokeWidth={180/zoom} role="button" aria-label={`${part==='incoming'?'入':'出'}方向手柄`} onPointerDown={e=>start(e,ci,ni,part)}/></g>)}
        <rect x={n.x-550/zoom} y={n.y-550/zoom} width={1100/zoom} height={1100/zoom} fill={selected?.c===ci&&selected.n===ni?'#f46b40':'#fff'} stroke="#d5653e" strokeWidth={150/zoom} role="button" aria-label={`轮廓 ${ci+1} 锚点 ${ni+1}`} onPointerDown={e=>start(e,ci,ni,'anchor')}/>
      </g>))}
    </svg></div><aside className="node-settings"><h3>锚点与方向线</h3>{node&&selected?<><p>轮廓 {selected.c+1} · 锚点 {selected.n+1}</p>{(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={`锚点 ${axis.toUpperCase()} 坐标`} type="number" step="1" value={Math.round(node[axis]*100)/100} onChange={e=>{if(e.target.value&&Number.isFinite(+e.target.value))commit(moveAnchor(outline,selected.c,selected.n,{x:node.x,y:node.y,[axis]:+e.target.value}));}}/></label>)}<span>{node.smooth?'平滑节点 · 手柄联动':'尖角节点 · 手柄独立'}</span><button onClick={()=>commit(setAnchorMode(outline,selected.c,selected.n,'smooth'))}>转为平滑节点</button><button onClick={()=>commit(setAnchorMode(outline,selected.c,selected.n,'corner'))}>转为尖角节点</button><button onClick={()=>commit(setAnchorMode(outline,selected.c,selected.n,'collapse'))}>收起手柄</button><button disabled={!outline[selected.c].closed && selected.n===outline[selected.c].nodes.length-1} onClick={()=>{commit(splitEdge(outline,selected.c,selected.n));select({c:selected.c,n:selected.n+1});}}>在后方曲线上加点</button><button disabled={outline[selected.c].nodes.length<=(outline[selected.c].closed?3:2)} onClick={()=>{commit(deleteAnchor(outline,selected.c,selected.n));select(null);}}>删除此锚点</button></>:<p>点击方形锚点，显示它的贝塞尔方向手柄。</p>}<p>拖动锚点移动位置；拖动圆形手柄调整曲线。Alt 拖动可单独调节手柄。方向键微移，Shift 加大步长。</p></aside></div>
    <div className="modal-actions"><button onClick={onClose}>取消节点修改</button><button className="primary" onClick={()=>onApply(writeOutline(outline),count)}>应用节点修改</button></div>
  </section></div>;
}
