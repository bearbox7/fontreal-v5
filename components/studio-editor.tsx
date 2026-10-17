"use client";
import { writeGlyphPath } from "@/lib/font/svg-path";
import svgpath from "svgpath";
import { useState, useEffect } from "react";
import {
  ClipboardPaste,
  X,
  Sparkles,
  Upload,
  Download,
  RotateCcw,
} from "lucide-react";
import type { StyleConfig, GlyphEdits, GlyphEdit } from "@/lib/font/types";
import { vectorizeDetailed, glyphPath, download } from "@/lib/font/engine";
import Glyph from "./studio-glyph";
import { redrawGlyph } from "@/lib/font/redraw";
import NodeEditor from "./glyph-node-editor";
import MentionInput from "./glyph-mention-input";
import GlyphFeedbackCanvas from "./glyph-feedback";
import type { GlyphFeedback } from "@/lib/font/glyph-feedback";
import { clipboardImage } from "@/lib/font/clipboard";
type Props = {
  character: string;
  glyphCharacters: string;
  style: StyleConfig;
  edits: GlyphEdits;
  reference: string;
  provider: string;
  configured: boolean;
  onClose: () => void;
  onSave: (edit: GlyphEdit) => void;
};
export default function Editor(p: Props) {
  const initial = { scale: 100, rotate: 0, x: 0, y: 0, version: 0 };
  const [edit, E] = useState<GlyphEdit>(p.edits[p.character] || initial),
    [busy, B] = useState(""),
    [error, ERR] = useState(""),
    [image, I] = useState(p.edits[p.character]?.sourceImage || ""),
    [threshold, T] = useState(128),
    [variants, V] = useState<GlyphEdit[]>([]);
  const [nodePath,setNodePath] = useState("");
  const [feedbackMode,setFeedbackMode] = useState(false);
  const [comments, setComments] = useState<GlyphFeedback[]>(p.edits[p.character]?.redrawComments || []);
  const [redrawPrompt, setRedrawPrompt] = useState(p.edits[p.character]?.redrawPrompt || "");
  const [redrawReference, setRedrawReference] = useState(p.edits[p.character]?.redrawReference || "");
  const [pasteTarget, setPasteTarget] = useState<"trace" | "reference">("trace");
  const [tolerance, setTolerance] = useState(4);
  const [showOriginal, setShowOriginal] = useState(false);
  const edits = { ...p.edits, [p.character]: edit };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (f && !busy) {
        e.preventDefault();
        if (f.size > 4e6) { ERR("请选择 4 MB 内的图片"); return; }
        const r = new FileReader();
        r.onload = () => {
          if (pasteTarget === "reference") void readReference(f).catch((e) => ERR(e.message));
          else void trace(r.result as string);
        };
        r.readAsDataURL(f);
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [threshold, tolerance, pasteTarget, busy]);
  async function pasteReference() {
    try { await readReference(await clipboardImage()); }
    catch (e) { ERR((e as Error).message); }
  }
  async function readReference(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4e6) {
      ERR("请选择 4 MB 内的 PNG、JPG 或 WEBP 图片"); return;
    }
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("无法读取参考图"));
      reader.readAsDataURL(file);
    });
    setRedrawReference(src); ERR("");
  }
  async function pasteImage() {
    try {
      const f = await clipboardImage(),
        r = new FileReader();
      r.onload = () => trace(r.result as string);
      r.readAsDataURL(f);
    } catch (e) {
      ERR((e as Error).message);
    }
  }
  async function trace(src: string, propagate = false) {
    B("正在矢量化");
    ERR("");
    try {
      const traced = await vectorizeDetailed(src, threshold, tolerance);
      E((e) => ({
        ...e,
        path: traced.path,
        traceStats: {
          nodes: traced.nodes,
          fidelity: traced.fidelity,
          tolerance: traced.tolerance,
        },
        scale: 100,
        rotate: 0,
        x: 0,
        y: 0,
        generatedStyle: src === e.sourceImage ? e.generatedStyle : undefined,
        sourceImage: src,
      }));
      I(src);
    } catch (e) {
      ERR((e as Error).message);
      if (propagate) throw e;
    } finally {
      B("");
    }
  }
  async function importArtwork(file?: File) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { ERR("文件最大支持 15 MB"); return; }
    const ext = file.name.toLowerCase().split(".").pop();
    if (["jpg", "jpeg", "png", "webp"].includes(ext || "")) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") void trace(reader.result); };
      reader.readAsDataURL(file);
      return;
    }
    B("正在提取矢量轮廓"); ERR("");
    try {
      const form = new FormData();
      form.set("file", file); form.set("char", p.character);
      const res = await fetch("/api/assets/import", { method:"POST", body:form });
      const result = await res.json();
      if (!res.ok || !result.ok) throw Error(result.error || "无法解析文件");
      // V4 converter emits screen coordinates, while Glyphs-style editing uses upward Y.
      const path = (result.paths as string[])
        .map(d => svgpath(d).scale(1,-1).translate(0,880).toString())
        .join("");
      if (!path) throw Error("未能提取可编辑轮廓");
      E(e => ({...e, path, scale:100, rotate:0, x:0, y:0, sourceImage:undefined, manuallyEdited:true}));
      I("");
      ERR(`已提取 ${result.path_count} 条路径，点击「编辑节点」调整。${result.note || ""}`);
    } catch(e) { ERR((e as Error).message + "；AI/EPS 转换需要服务器安装 Inkscape 和 Ghostscript。"); }
    finally {B("");}
  }
  async function ai() {
    if (!p.configured) {
      ERR("请先在 AI 服务设置中连接服务器密钥");
      return;
    }
    if (comments.some(c => !c.text.trim())) { ERR("请填写每个位置的修改意见，或删除空点评"); return; }
    B("AI 正在重绘此字");
    ERR("");
    try {
      const result = await redrawGlyph({
        character:p.character, style:p.style, provider:p.provider, reference:p.reference,
        edits:{...p.edits,[p.character]:{...edit,redrawPrompt,redrawReference,redrawComments:comments}},
        threshold,tolerance,glyphCharacters:p.glyphCharacters,
        checkpoint: async (pending) => E(pending),
      });
      E(result); I(result.sourceImage || "");setComments([]);setShowOriginal(false);
    } catch (e) {
      ERR((e as Error).message);
    } finally {
      B("");
    }
  }
  async function openNodes() {
    try { const path=await glyphPath(p.character,p.style,edits);setNodePath(writeGlyphPath(path)); }
    catch(e){ERR((e as Error).message);}
  }
  async function svg() {
    const path = await glyphPath(p.character, p.style, edits);
    download(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g transform="translate(0 880) scale(1 -1)"><path d="${writeGlyphPath(path)}"/></g></svg>`,
      `glyph-${p.character.codePointAt(0)!.toString(16)}.svg`,
      "image/svg+xml",
    );
  }
  return (
    <div className="overlay" onClick={() => { if (!busy) p.onClose(); }}>
      <section
        className="modal glyph-editor"
        role="dialog"
        aria-modal="true"
        aria-label="字符编辑器"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close"
          aria-label="关闭字符编辑器"
          disabled={!!busy}
          onClick={p.onClose}
        >
          <X size={20} />
        </button>
        <div className="eyebrow">GLYPH STUDIO</div>
        <h2>
          雕琢「{p.character}」
          <small>
            U+{p.character.codePointAt(0)!.toString(16).toUpperCase()} · v
            {edit.version + 1}
          </small>
        </h2>
        <div className="editor-layout">
          <div>
            <button className="node-entry wide" disabled={!!busy} onClick={openNodes}>编辑节点 · 锚点与贝塞尔手柄</button>
            <GlyphFeedbackCanvas glyphCharacters={p.glyphCharacters} styleConfig={p.style} edits={edits} onModeChange={(active)=>{setFeedbackMode(active);setShowOriginal(false);}} points={comments} onChange={(next) => {setComments(next);setShowOriginal(false);}} disabled={!!busy}>
            <div className="edit-canvas">
              {showOriginal && image ? (
                <img
                  className="trace-original"
                  src={image}
                  alt="单字原始生成图片"
                />
              ) : (
                <Glyph char={p.character} style={p.style} edits={edits} grid />
              )}
            </div>
            </GlyphFeedbackCanvas>
            {image && (
              <button
                className="wide"
                disabled={feedbackMode}
                onClick={() => setShowOriginal(!showOriginal)}
              >
                {showOriginal ? "查看矢量曲线" : "对照原始图片"}
              </button>
            )}
            {edit.traceStats && (
              <p className="trace-stats">
                平滑曲线 · {edit.traceStats.nodes} 个轮廓节点 · 原图重合{" "}
                {(edit.traceStats.fidelity * 100).toFixed(2)}%
              </p>
            )}
            <div className="editor-tools" onFocus={() => setPasteTarget("trace")}>
              <button disabled={!!busy} onClick={pasteImage}>
                <ClipboardPaste size={14} />
                粘贴图片
              </button>
              <button onClick={svg}>
                <Download size={14} />
                SVG
              </button>
              <button onClick={() => E(initial)}>
                <RotateCcw size={14} />
                还原
              </button>
              <label className="upload-small">
                <Upload size={14} />
                导入 JPG / PNG / SVG / AI / EPS / TTF / OTF
                <input
                  hidden
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,.ai,.eps,.ttf,.otf"
                  onChange={(e) => {
                    void importArtwork(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {image && (
              <div>
                <label className="slider">
                  <span>
                    描摹阈值<b>{threshold}</b>
                  </span>
                  <input
                    type="range"
                    min="40"
                    max="220"
                    value={threshold}
                    onChange={(e) => T(+e.target.value)}
                  />
                </label>
                <label className="slider">
                  <span>
                    曲线拟合容差上限<b>{tolerance} px</b>
                  </span>
                  <input
                    aria-label="曲线拟合容差"
                    type="range"
                    min="0.5"
                    max="4"
                    step="0.5"
                    value={tolerance}
                    onChange={(e) => setTolerance(+e.target.value)}
                  />
                </label>
                <p className="trace-stats">
                  容差越大，越倾向于减少节点；自动核对原图轮廓，并检查边缘偏差。显示的重合率以当前图片为准。
                </p>
                <button
                  className="wide"
                  disabled={!!busy}
                  onClick={() => trace(image)}
                >
                  平滑重新描摹
                </button>
              </div>
            )}
          </div>
          <div className="editor-settings">
            <div className="redraw-controls" onFocus={() => setPasteTarget("reference")}>
              <h3>定向重绘「{p.character}」</h3>
              <label className="redraw-label" htmlFor="redraw-prompt">重绘描述词</label>
              <MentionInput characters={p.glyphCharacters} edits={edits} styleConfig={p.style} id="redraw-prompt" value={redrawPrompt} maxLength={2000} disabled={!!busy}
                placeholder="例如：补齐下方横画，保留完整笔画；保持粗厚、圆润的笔触，避免写成其他字。"
                onValue={setRedrawPrompt} />
              <p className="control-foot">输入 @字 或 @U+编号，引用本字库其他字形；一次最多 4 字。比如：横画末端参考 @字。</p>
              <label className="redraw-label">单字参考图（可选）</label>
              {redrawReference && <img className="redraw-reference" src={redrawReference} alt={`「${p.character}」重绘参考图`} />}
              <div className="editor-tools">
                <label className="upload-small">上传参考图
                  <input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) void readReference(file).catch((e) => ERR(e.message)); e.target.value = ""; }} />
                </label>
                <button disabled={!!busy} onClick={pasteReference}>粘贴参考图</button>
                {redrawReference && <button disabled={!!busy} onClick={() => setRedrawReference("")}>移除</button>}
              </div>
              <p className="control-foot">参考图用于纠正这个字的结构；同时沿用项目参考图的风格。支持 4 MB 内图片。在此区域粘贴图片即可设为参考图。</p>
              <button className="primary wide" disabled={!!busy} onClick={ai}>
                <Sparkles size={15} />{busy || `重新重绘「${p.character}」`}
              </button>
              <p className="control-foot">每次仅请求一张单字图，核对后点击“应用到字库”。描述词、参考图和点评随该字保存。成功生成后清空本轮点评，避免对新字形重复修改。</p>
            </div>
            {(
              [
                ["scale", "缩放", 60, 130],
                ["rotate", "旋转", -20, 20],
                ["x", "水平位移", -150, 150],
                ["y", "垂直位移", -150, 150],
              ] as const
            ).map(([k, l, min, max]) => (
              <label key={k} className="slider">
                <span>
                  {l}
                  <b>
                    {edit[k]}
                    {k === "scale" ? "%" : k === "rotate" ? "°" : ""}
                  </b>
                </span>
                <input
                  type="range"
                  aria-label={l}
                  min={min}
                  max={max}
                  value={edit[k]}
                  onChange={(e) => E({ ...edit, [k]: +e.target.value })}
                />
              </label>
            ))}
            <button
              className="wide"
              onClick={() =>
                V(
                  [-6, -2, 2, 6].map((n) => ({
                    ...edit,
                    scale: 100 + n,
                    rotate: n / 2,
                  })),
                )
              }
            >
              探索 4 个参数变体
            </button>
          </div>
        </div>
        {variants.length > 0 && (
          <div className="variations">
            {variants.map((v, i) => (
              <button key={i} onClick={() => E(v)}>
                <Glyph
                  char={p.character}
                  style={p.style}
                  edits={{ [p.character]: v }}
                />
                <span>变体 {i + 1}</span>
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button disabled={!!busy} onClick={p.onClose}>取消</button>
          <button
            className="primary"
            disabled={!!busy || comments.some(c => !c.text.trim())}
            onClick={() => p.onSave({ ...edit, redrawPrompt, redrawReference, redrawComments: comments, version: edit.version + 1 })}
          >
            应用到字库
          </button>
        </div>
      </section>
      {nodePath && <NodeEditor path={nodePath} onClose={()=>setNodePath("")} onApply={(path,nodes)=>{
        E(e=>({...e,path,scale:100,rotate:0,x:0,y:0,generatedStyle:p.style,traceStats:undefined,pendingGeneration:undefined,manuallyEdited:true}));
        setNodePath("");setShowOriginal(false);setComments([]);
      }}/>}
    </div>
  );
}
