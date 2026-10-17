"use client";
import { useState, useRef, type ReactNode } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import MentionInput from "./glyph-mention-input";
import type { GlyphEdits, StyleConfig } from "@/lib/font/types";
import type { GlyphFeedback } from "@/lib/font/glyph-feedback";
export default function GlyphFeedbackCanvas({children,points,onChange,disabled,onModeChange,glyphCharacters,styleConfig,edits}:{glyphCharacters:string;styleConfig:StyleConfig;edits:GlyphEdits;children:ReactNode;points:GlyphFeedback[];onChange:(p:GlyphFeedback[])=>void;disabled:boolean;onModeChange:(active:boolean)=>void}) {
  const commentFields = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [marking,setMarking]=useState(false);
  const [active,setActive]=useState(-1);
  function add(x:number,y:number) {
    if(disabled || points.length>=8) return;
    setActive(points.length);onChange([...points,{x,y,text:""}]);
  }
  return <div className="feedback-workspace">
    <div className="feedback-toolbar">
      <button type="button" aria-pressed={marking} className={marking ? "active" : ""} disabled={disabled} onClick={()=>{setMarking(!marking);onModeChange(!marking);}}><MessageCircle size={14}/>{marking ? "结束位置点评" : "点评修改位置"}</button>
      <span>{points.length}/8 个点评</span>
    </div>
    <div className={`feedback-canvas ${marking ? "is-marking" : ""}`} role={marking ? "button" : undefined} tabIndex={marking ? 0 : undefined} aria-label={marking ? "点击字形添加点评位置；回车在中心添加" : undefined}
      onKeyDown={(e)=>{if(marking && e.target===e.currentTarget && (e.key==="Enter" || e.key===" ")){e.preventDefault();add(.5,.5);}}}
      onClick={(e)=>{if(!marking || disabled) return; const r=e.currentTarget.getBoundingClientRect();add(Math.min(.97,Math.max(.03,(e.clientX-r.left)/r.width)),Math.min(.97,Math.max(.03,(e.clientY-r.top)/r.height)));}}>
      {children}
      {points.map((point,i)=><button key={i} type="button" className={`feedback-pin ${active===i ? "selected" : ""}`} style={{left:`${point.x*100}%`,top:`${point.y*100}%`}} aria-label={`编辑点评 ${i+1}`} disabled={disabled} onClick={(e)=>{e.stopPropagation();setActive(i);commentFields.current[i]?.focus();}}>{i+1}</button>)}
    </div>
    <p className="feedback-hint">{marking ? "点击需要修改的笔画，再在下方填写意见。" : "开启位置点评，可指出缺笔、粘连或局部形状问题。"} AI 会尽量保留其余字形。</p>
    {points.map((point,i)=><div key={i} className={`feedback-comment ${active===i ? "selected" : ""}`}>
      <div><strong>点评 {i+1}</strong><small>位置 {Math.round(point.x*100)}%, {Math.round(point.y*100)}%</small><button type="button" aria-label={`删除点评 ${i+1}`} disabled={disabled} onClick={()=>{onChange(points.filter((_,j)=>i!==j));setActive(-1);}}><Trash2 size={13}/></button></div>
      <MentionInput characters={glyphCharacters} edits={edits} styleConfig={styleConfig} ref={(element)=>{commentFields.current[i]=element;}} aria-label={`点评 ${i+1} 修改意见`} placeholder="例如：这里补上一横，末端保持圆润。" maxLength={500} value={point.text} disabled={disabled} autoFocus={active===i && !point.text} onFocus={()=>setActive(i)} onValue={(text)=>onChange(points.map((p,j)=>i===j?{...p,text}:p))}/>
    </div>)}
  </div>;
}
