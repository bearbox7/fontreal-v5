"use client";
import { forwardRef, useRef, useState, type TextareaHTMLAttributes } from "react";
import type { GlyphEdits, StyleConfig } from "@/lib/font/types";
import { glyphCode, resolveGlyphMentions } from "@/lib/font/glyph-mentions";
import Glyph from "./studio-glyph";
type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,"value"|"onChange"> & {value:string;onValue:(value:string)=>void;characters:string;edits:GlyphEdits;styleConfig:StyleConfig};
const MentionInput = forwardRef<HTMLTextAreaElement,Props>(function MentionInput({value,onValue,characters,edits,styleConfig,...props},forwardedRef){
  const field=useRef<HTMLTextAreaElement|null>(null);
  const [query,setQuery]=useState<{start:number;end:number;text:string}|null>(null);
  const [highlight,setHighlight]=useState(0), [inspect,setInspect]=useState("");
  function updateQuery(text:string,caret:number) {
    const match=text.slice(0,caret).match(/@([^\s@，。；：、！？“”"'（）()\[\]]*)$/u);
    setQuery(match ? {start:caret-match[0].length,end:caret,text:match[1]} : null);setHighlight(0);
  }
  const options=query ? Array.from(characters).sort((a,b)=>Number(!!edits[b]?.path)-Number(!!edits[a]?.path)).filter(c=>!query.text || c===query.text || glyphCode(c).toLowerCase().includes(query.text.toLowerCase())).slice(0,8):[];
  function choose(character:string) {
    if(!query)return;
    const replacement=`@${character}(${glyphCode(character)}) `;
    const next=value.slice(0,query.start)+replacement+value.slice(query.end);
    if(props.maxLength && next.length>props.maxLength)return;
    const caret=query.start+replacement.length;onValue(next);setQuery(null);setInspect(character);
    requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(caret,caret);});
  }
  const resolved=resolveGlyphMentions([value],characters);
  return <div className="mention-input">
    <textarea {...props} value={value} ref={(element)=>{field.current=element;if(typeof forwardedRef==="function")forwardedRef(element);else if(forwardedRef)forwardedRef.current=element;}}
      aria-expanded={!!query} aria-controls={query ? `${props.id || "glyph"}-mentions` : undefined}
      onChange={(e)=>{onValue(e.target.value);updateQuery(e.target.value,e.target.selectionStart);}}
      onSelect={(e)=>{if(document.activeElement===e.currentTarget)updateQuery(value,e.currentTarget.selectionStart);}}
      onKeyDown={(e)=>{if(e.nativeEvent.isComposing || !query)return;if(e.key==="Escape"){e.preventDefault();setQuery(null);}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setHighlight(h=>(h+(e.key==="ArrowDown"?1:-1)+Math.max(1,options.length))%Math.max(1,options.length));}else if(e.key==="Enter"&&options.length){e.preventDefault();choose(options[highlight]);}}}
      onBlur={()=>setQuery(null)} />
    {query && <div className="mention-menu" id={`${props.id || "glyph"}-mentions`} role="listbox" aria-label="字库引用候选">
      <small>按字符或 U+ 编号定位 · Enter 选取</small>
      {!options.length && <p>没有匹配的字形，请检查字符或编号。</p>}
      {options.map((c,i)=><button type="button" role="option" aria-selected={i===highlight} aria-label={`引用「${c}」 ${glyphCode(c)}`} key={c} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(c)}><Glyph char={c} style={styleConfig} edits={edits}/><span>{c}<small>{glyphCode(c)}</small></span><small>{edits[c]?.path ? "已定制" : "基础字形"}</small></button>)}
    </div>}
    {resolved.references.length>0 && <div className="mention-references">{resolved.references.map(r=><button type="button" key={r.code} disabled={props.disabled} onClick={()=>setInspect(inspect===r.character?"":r.character)} aria-label={`查看引用「${r.character}」 ${r.code}`}><span>@{r.character}</span><small>{r.code}</small></button>)}</div>}
    {inspect && resolved.references.some(r=>r.character===inspect) && <div className="mention-preview"><Glyph char={inspect} style={styleConfig} edits={edits}/><span>引用「{inspect}」<small>{glyphCode(inspect)} · {edits[inspect]?.path ? "当前已保存字形" : "基础字形"}</small></span><button type="button" aria-label="收起引用预览" onClick={()=>setInspect("")}>×</button></div>}
    {resolved.errors.map(e=><p className="mention-error" key={e}>{e}</p>)}
  </div>;
});
export default MentionInput;
