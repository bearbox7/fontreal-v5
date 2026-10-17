"use client";
import { useState, useEffect, useRef } from "react";
import svgpath from "svgpath";
import {
  Sparkles,
  Plus,
  Grid2X2,
  Type,
  Download,
  ImagePlus,
  ArrowUpRight,
  SlidersHorizontal,
  ClipboardPaste,
  Settings2,
  FolderOpen,
  Check,
  X,
  ChevronRight,
  BookOpen,
  RotateCcw,
  Upload,
  LibraryBig,
  FileType,
  AlertTriangle,
} from "lucide-react";
import {
  DEFAULT_STYLE,
  PRESETS,
  type StyleConfig,
  type GlyphEdits,
  type Analysis,
} from "@/lib/font/types";
import {
  createFont,
  asTTF,
  download,
  vectorizeDetailed,
  coverageFor,
  registerSourceFont,
  clearSourceFont,
} from "@/lib/font/engine";
import { GB_SCOPES, chosenCharacters, type GbScope, type GbData, type GbRecord } from "@/lib/font/gb2312";
import Glyph from "./studio-glyph";
import { redrawGlyph } from "@/lib/font/redraw";
import Editor from "./studio-editor";
import SheetReview from "./sheet-review";
import ExpansionPanel from "./expansion-panel";
import {
  COMMON_FIRST,
  defaultExpansion,
  preparedCharacters,
  type ExpansionState,
} from "@/lib/font/expansion";
import {
  SHEET,
  DEFAULT_TEST_TEXT,
  testCharacters,
  limitTestText,
  previewRows,
  sheetLayout,
  type SheetCapacity,
} from "@/lib/font/sheet-layout";
import {
  generateTestSheets,
  applySheets,
  type GlyphSheet,
} from "@/lib/font/sheet";
import { generateTestGlyphs } from "@/lib/font/ai-test";
import { singleGenerationPlan } from "@/lib/font/single-generation";
import { clipboardImage } from "@/lib/font/clipboard";
import { saveProject, listProjects } from "@/lib/font/storage";
import {
  MAX_PROJECT_BYTES,
  parseProjectFile,
  serializeProject,
  projectFilename,
} from "@/lib/font/project-file";
export default function Studio() {
  const [batchMode, setBatchMode] = useState(true);
  const [sheetCapacity, setSheetCapacity] = useState<SheetCapacity>(72);
  const layout = sheetLayout(sheetCapacity);
  const [sheets, setSheets] = useState<GlyphSheet[]>([]);
  const [sheetStamp, setSheetStamp] = useState("");
  const [sheetReview, setSheetReview] = useState(false);
  const [queuedTest, QT] = useState<"test" | "prepared" | null>(null);
  const [expansion, setExpansion] = useState<ExpansionState>(defaultExpansion);
  const [batchCharacters, setBatchCharacters] = useState("");
  const [testText, TX] = useState(DEFAULT_TEST_TEXT),
    [coverage, CV] = useState(""),
    [tested, TD] = useState(""),
    [generatedChars, GC] = useState("");
  const [style, S] = useState<StyleConfig>(DEFAULT_STYLE),
    [edits, E] = useState<GlyphEdits>({});
  const [view, V] = useState("create"),
    [mode, M] = useState("image"),
    [name, N] = useState("我的第一款字体");
  const [reference, R] = useState(""),
    [prompt, P] = useState(""),
    [analysis, A] = useState<Analysis | null>(null);
  const [provider, Q] = useState("openai"),
    [status, T] = useState({ openai: false, gemini: false });
  const [chars, C] = useState({
    all: "",
    chinese: "",
    latin: "",
    punctuation: "",
  });
  const [gb, setGb] = useState<GbData | null>(null);
  const [gbScope, setGbScope] = useState<GbScope>("level1");
  const [gbCustom, setGbCustom] = useState("年轻的声音，让更多人听见");
  const [gbQuery, setGbQuery] = useState("");
  const [gbPage, setGbPage] = useState(0);
  const [sourceFile, setSourceFile] = useState("");
  const [baseRevision, setBaseRevision] = useState(0);
  const [gbResult, setGbResult] = useState<{wanted:number;covered:number;missing:string}|null>(null);
  const [gbBusy, setGbBusy] = useState(false);
  const [modal, U] = useState(""),
    [selected, D] = useState(""),
    [notice, B] = useState("");
  const [busy, F] = useState(""),
    [progress, G] = useState(0),
    [fontBuffer, J] = useState<ArrayBuffer | null>(null);
  const [redrawingChar, setRedrawingChar] = useState("");
  const redrawLock = useRef(false);
  const [generationError, setGenerationError] = useState("");
  const [busySeconds, setBusySeconds] = useState(0);
  const busyActive = !!busy;
  useEffect(() => {
    setBusySeconds(0);
    if (!busyActive) return;
    const started = Date.now();
    const timer = setInterval(
      () => setBusySeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busyActive]);
  const [count, K] = useState(0),
    [family, H] = useState(""),
    [query, W] = useState(""),
    [filter, Z] = useState("chinese"),
    [page, Y] = useState(0);
  const [sample, SS] = useState(
    "让每个字，都有自己的表达。\n山川有信，风月无边。\nThe quick brown fox 0123456789",
  );
  const [size, SZ] = useState(48),
    [space, SP] = useState(0),
    [line, LI] = useState(1.7),
    [dark, DK] = useState(false);
  const [inkColor, setInkColor] = useState("#242c29");
  const [paperColor, setPaperColor] = useState("#f4f2ed");
  const [projects, LP] = useState<any[]>([]),
    [id, ID] = useState(""),
    [saved, SV] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    loaded = useRef(false),
    face = useRef<FontFace | null>(null);
  useEffect(() => {
    ID(crypto.randomUUID());
    fetch("/fonts/gb2312-full.json")
      .then(r => {if(!r.ok)throw Error("GB2312 数据加载失败");return r.json() as Promise<GbData>})
      .then(data => setGb(data))
      .catch(() => B("GB2312 国标数据加载失败，请检查文件目录"));
    fetch("/fonts/charset.json")
      .then((r) => r.json() as Promise<any>)
      .then(C)
      .catch(() => B("基础字库加载失败，请刷新重试"));
    fetch("/api/status")
      .then((r) => r.json() as Promise<any>)
      .then((d) => T(d.providers))
      .catch(() => {});
    loaded.current = true;
  }, []);
  useEffect(() => {
    J(null);
    H("");
  }, [
    style,
    edits,
    name,
    testText,
    reference,
    provider,
    batchMode,
    sheetCapacity,
  ]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => B(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    SV(false);
  }, [
    style,
    edits,
    name,
    reference,
    prompt,
    provider,
    batchMode,
    sheets,
    testText,
    sheetCapacity,
    expansion,
    sample,
    size,
    space,
    line,
    dark, inkColor, paperColor,
  ]);
  const gbText = gb ? chosenCharacters(gb, gbScope, gbCustom) : "";
  const gbRecords = new Map<string,GbRecord>(gb?.records.map(record => [record.char,record] as const) || []);
  const gbFiltered = Array.from(gbText).filter(c => {
    const r=gbRecords.get(c);
    const key=gbQuery.trim().toLowerCase().replace(/^0x/,"");
    return !key || c.includes(key) || r?.unicode.toLowerCase().includes(key) || r?.gb.toLowerCase().includes(key) || `${r?.zone}-${r?.position}`.includes(key);
  });
  useEffect(() => {
    if (!gbText) {setGbResult(null);return;}
    let live=true;
    coverageFor(gbText, style, edits).then(result => {
      if(live)setGbResult(result);
    }).catch(()=>{if(live)setGbResult(null);});
    return ()=>{live=false;};
  }, [gbText, style, edits, baseRevision]);
  async function loadSourceFile(file?: File) {
    if (!file)return;
    if(file.size>32*1024*1024 || !/\.(ttf|otf)$/i.test(file.name)){
      B("请选择 32 MB 以内的 TTF / OTF 底库文件");return;
    }
    try {
      await registerSourceFont(await file.arrayBuffer(),file.name);
      setSourceFile(file.name);setBaseRevision(n=>n+1);
      S(v=>({...v}));
      B(`已载入「${file.name}」，可用它补齐原基础字体缺少的字；底库只在当前页面会话使用。`);
    }catch(e){B("字体加载失败："+(e as Error).message);}
  }
  async function exportPoster(type:"png"|"svg", dimension:2048|3840=3840) {
    const width=dimension, height=Math.round(width*9/16);
    const foreground=dark?"#f2f3f0":inkColor;
    const background=dark?"#292e2c":paperColor;
    const fontName=family || (style.base==="sans"?"Zifangsans":"Zifangserif");
    const fontSize=Math.min(185,Math.max(54,Math.round(size*3.1*(width/3840))));
    const paragraphs=sample.split("\n").slice(0,10);
    const lineHeight=fontSize*line;
    const firstY=Math.max(100,(height-(paragraphs.length-1)*lineHeight)/2);
    const escape=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/><g fill="${foreground}" font-family="${escape(fontName)}" font-size="${fontSize}" font-weight="${family?400:style.weight}" letter-spacing="${space*3}">${paragraphs.map((row,i)=>`<text x="${Math.round(width*.1)}" y="${Math.round(firstY+i*lineHeight)}">${escape(row)}</text>`).join("")}</g></svg>`;
    if(type==="svg"){
      download(svg,`FontReal-poster-${width}.svg`,"image/svg+xml;charset=utf-8");
      B("SVG 文字仍可编辑，但在另一台电脑需安装相同字体才能完整还原字形。");
      return;
    }
    try{
      await document.fonts.ready;
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext("2d");if(!ctx)throw Error("浏览器无法创建画布");
      ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
      ctx.font=`${family?400:style.weight} ${fontSize}px "${fontName}"`;
      ctx.fillStyle=foreground;
      ctx.textBaseline="alphabetic";
      for(let i=0;i<paragraphs.length;i++){
        const row=paragraphs[i];let x=width*.1;
        for(const c of Array.from(row)){
          if(x>width*.94)break;
          ctx.fillText(c,x,firstY+i*lineHeight);
          x+=ctx.measureText(c).width+space*3;
        }
      }
      canvas.toBlob(blob=>{
        if(!blob){B("PNG 导出失败");return;}
        download(blob,`FontReal-poster-${width}.png`,"image/png");
      },"image/png");
    }catch(e){B("PNG 导出失败："+(e as Error).message);}
  }
  function exportGbTable(type:"csv"|"txt") {
    if(!gb) return;
    const selected=new Set(Array.from(gbText));
    const content=type==="txt"
      ? gbText
      : "字符,GB2312十六进制,Unicode,区号,位号,分级\n"+gb.records.filter(r=>selected.has(r.char))
          .map(r=>[r.char,r.gb,r.unicode,r.zone,r.position,r.type].join(",")).join("\n");
    download(type==="csv" ? "\uFEFF"+content : content,
      `GB2312-${gbScope}.${type}`,type==="csv"?"text/csv;charset=utf-8":"text/plain;charset=utf-8");
  }
  async function exportGbFont(type:"ttf"|"otf") {
    if(!gb||!gbText){B("请先加载并选择字库范围");return;}
    if(gbBusy)return;
    setGbBusy(true);G(0);
    try{
      const scope=gbScope, text=gbText;
      const report=await coverageFor(text,style,edits);
      if(!report.covered)throw Error("当前没有任何可输出轮廓，请先编辑字形或上传字体底库。 ");
      const result=await createFont(style,edits,text,name,G);
      const output=type==="ttf"?await asTTF(result.buffer):result.buffer;
      download(output,`FontReal-${scope}.${type}`,type==="ttf"?"font/ttf":"font/otf");
      download(JSON.stringify({standard:"GB2312-1980",scope,source:sourceFile||"Bundled Noto sub-font",
        requested:report.wanted,covered:report.covered,missing:report.missing.length,
        note:"仅包含已存在或已经编辑的字形；未自动补齐缺字。"},null,2),
        `FontReal-${scope}-report.json`,"application/json;charset=utf-8");
      download(report.missing||"无缺字",`FontReal-${scope}-missing.txt`,"text/plain;charset=utf-8");
      B(`已下载 ${type.toUpperCase()} 与覆盖报告：${report.covered}/${report.wanted} 个目标字符；缺字 ${report.missing.length} 个。`);
    }catch(e){B("GB2312 导出失败："+(e as Error).message);}
    finally{setGbBusy(false);G(0);}
  }
  const signature = JSON.stringify({
    style,
    edits,
    name,
    id,
    testText,
    reference,
    provider,
    batchMode,
    sheetCapacity,
  });
  const current = useRef(signature);
  current.current = signature;
  const sheetSignature = JSON.stringify({
    style,
    reference,
    testText,
    provider,
    batchMode,
    sheetCapacity,
    id,
  });
  const sheetCurrent = useRef(sheetSignature);
  sheetCurrent.current = sheetSignature;
  const configured = status[provider as keyof typeof status];
  const singlePlan = singleGenerationPlan(testText, edits);
  useEffect(
    () => setGenerationError(""),
    [reference, testText, provider, batchMode, style],
  );
  function change(key: keyof StyleConfig, value: any) {
    S((s) => ({ ...s, [key]: value }));
  }
  function projectData() {
    return {
      id,
      name,
      style,
      edits,
      reference,
      prompt,
      analysis,
      testText,
      provider,
      batchMode,
      sheets,
      sheetStamp,
      sheetCapacity,
      expansion,
      preview: { sample, size, space, line, dark, inkColor, paperColor },
      updatedAt: Date.now(),
    };
  }
  const latestProject = useRef(projectData());
  latestProject.current = projectData();
  const persistQueue = useRef(Promise.resolve());
  function persist(data: Record<string, unknown>) {
    persistQueue.current = persistQueue.current
      .catch(() => {})
      .then(() => saveProject(data));
    return persistQueue.current;
  }
  async function save() {
    try {
      await persist(projectData());
      SV(true);
      B("项目已保存在此浏览器");
    } catch {
      B("保存失败，请检查浏览器存储空间");
    }
  }
  function exportProject() {
    try {
      download(
        serializeProject(projectData()),
        projectFilename(name),
        "application/json;charset=utf-8",
      );
      B("项目 JSON 已导出，含参数、样字、参考图和扩字进度；可在 Safari 导入。");
    } catch (e) {
      B((e as Error).message);
    }
  }
  async function importProject(file?: File) {
    if (!file) return;
    if (file.size > MAX_PROJECT_BYTES) {
      B("请选择 256 MB 内的项目 JSON 文件");
      return;
    }
    F("导入项目");
    try {
      const source = await file.text();
      let project: any;
      try {
        const incoming = JSON.parse(source);
        if (incoming && typeof incoming === "object" && incoming.version === "3.0" && incoming.glyphs) {
          const updated: GlyphEdits = {};
          for (const [character, contours] of Object.entries(incoming.glyphs)) {
            if (Array.from(character).length !== 1 || !Array.isArray(contours) ||
                !contours.every(d => typeof d === "string")) continue;
            const data = contours.join("");
            if (!data || data.length > 3_000_000) continue;
            updated[character] = {
              path:svgpath(data).matrix([1,0,0,-1,0,880]).toString(),
              scale:100,rotate:0,x:0,y:0,version:1,manuallyEdited:true,
            };
          }
          if (!Object.keys(updated).length) throw Error("V4 工程中没有可导入的字形");
          project = { ...latestProject.current, id:crypto.randomUUID(), name:"导入的字境 V4 工程",
            edits:updated, reference:"",prompt:"",analysis:null,updatedAt:Date.now() };
        } else project = parseProjectFile(source, crypto.randomUUID());
      } catch(e) { throw Error("项目文件读取失败："+(e as Error).message); }
      // Preserve the current draft and import as a new copy, including on Safari.
      await persist(latestProject.current);
      await persist(project);
      open(project);
      B(
        project.reference
          ? `已导入「${project.name}」，可继续扩字或打包字体；原有项目已保留。`
          : `已导入「${project.name}」及所有字形。文件不含参考图，扩字前请补充；原有项目已保留。`,
      );
    } catch (e) {
      B(`导入失败：${(e as Error).message}`);
    } finally {
      F("");
      if (projectInput.current) projectInput.current.value = "";
    }
  }
  async function library() {
    try {
      LP((await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt));
      V("library");
    } catch {
      B("无法读取本地项目");
    }
  }
  function open(p: any) {
    ID(p.id);
    N(p.name);
    S(p.style);
    E(p.edits);
    R(p.reference);
    P(p.prompt);
    A(p.analysis);
    TX(p.testText || DEFAULT_TEST_TEXT);
    Q(p.provider || "openai");
    setBatchMode(p.batchMode ?? true);
    setSheetCapacity(p.sheetCapacity === 32 ? 32 : 72);
    setSheets(p.sheets || []);
    setSheetStamp(p.sheetStamp || "");
    setExpansion({ ...defaultExpansion(), ...p.expansion });
    setBatchCharacters("");
    SS(p.preview?.sample ?? p.testText ?? DEFAULT_TEST_TEXT);
    SZ(p.preview?.size ?? 48);
    SP(p.preview?.space ?? 0);
    LI(p.preview?.line ?? 1.7);
    DK(p.preview?.dark ?? false);
    setInkColor(p.preview?.inkColor ?? "#242c29");
    setPaperColor(p.preview?.paperColor ?? "#f4f2ed");
    TD("");
    CV("");
    K(0);
    V("create");
  }
  function fresh() {
    ID(crypto.randomUUID());
    N("未命名字体");
    S(DEFAULT_STYLE);
    E({});
    R("");
    P("");
    A(null);
    K(0);
    CV("");
    TX(DEFAULT_TEST_TEXT);
    setSheetCapacity(72);
    setSheets([]);
    setSheetStamp("");
    setExpansion(defaultExpansion());
    setBatchCharacters("");
    V("create");
  }
  useEffect(() => {
    if (selected) return;
    const paste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        M("image");
        V("create");
        upload(file);
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [selected]);
  async function pasteImage() {
    try {
      await upload(await clipboardImage());
    } catch {
      B("无法读取图片，请允许剪贴板访问，或使用 ⌘V / Ctrl+V");
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      B("请选择 12 MB 内的 PNG / JPG / WEBP 图片");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const s = Math.min(1, 1400 / Math.max(img.width, img.height)),
        c = document.createElement("canvas");
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      R(c.toDataURL("image/jpeg", 0.88));
      A(null);
      B("参考图已添加，可分析风格或手动调整");
    } catch {
      B("图片读取失败，请换一张图片");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function analyze() {
    if (!configured) {
      U("settings");
      return;
    }
    if (!reference && !prompt.trim()) {
      B("请先上传参考图或填写风格描述");
      return;
    }
    F("分析字体风格");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(mode === "image" ? { image: reference } : { prompt }),
        }),
      });
      const d: any = await res.json();
      if (!res.ok) throw Error(d.error);
      A(d.analysis);
      S(d.analysis.style);
      B("风格分析完成，参数已应用");
    } catch (e) {
      B((e as Error).message);
    } finally {
      F("");
    }
  }
  useEffect(() => {
    if (queuedTest) {
      const scope = queuedTest;
      QT(null);
      build(scope);
    }
  }, [queuedTest, edits]);
  async function redrawFromCard(character: string) {
    if (redrawLock.current || busy) return;
    if (!configured) { U("settings"); return; }
    redrawLock.current = true;setRedrawingChar(character); F(`正在重绘「${character}」`);G(0);
    setGenerationError("");
    const projectId = latestProject.current.id;
    async function storeEdit(edit: GlyphEdits[string]) {
      if (latestProject.current.id !== projectId) throw Error("项目已切换，重绘结果未写入其他项目");
      const next = {...latestProject.current.edits,[character]:edit};
      await persist({...latestProject.current,edits:next,updatedAt:Date.now()});
      E(next);
    }
    try {
      const result = await redrawGlyph({character,style,edits,reference,provider,glyphCharacters:chars.all,checkpoint:storeEdit});
      await storeEdit(result);J(null);G(100);
      B(`「${character}」已重新重绘并保存，可点击字形核对；重新打包后应用到字体导出。`);
    } catch (e) { const message=(e as Error).message;setGenerationError(message);B(message); }
    finally { F("");setRedrawingChar("");redrawLock.current=false; }
  }
  async function generatePreview() {
    if (busy) return;
    setGenerationError("");
    const singleMode = !(batchMode && provider === "openai");
    if (
      singleMode &&
      singlePlan.characters.length &&
      !singlePlan.remaining.length
    ) {
      await build("test");
      return;
    }
    const needsRequest = !singleMode || singlePlan.requests.length > 0;
    if (
      !reference &&
      needsRequest &&
      singleMode &&
      (singlePlan.completed.length || singlePlan.images.length)
    ) {
      setGenerationError(
        "已有字形和图片已保留，请补充参考图后继续未完成的字。",
      );
      return;
    }
    if (!reference && needsRequest) {
      await build("test");
      return;
    }
    if (needsRequest && !configured) {
      U("settings");
      return;
    }
    const stamp = sheetSignature;
    F("API 生成测试字");
    G(0);
    try {
      const target = Array.from(testText)
        .filter((c) => chars.all.includes(c))
        .join("");
      if (!target) throw Error("请先填写支持的测试文字");
      const unsupported = testCharacters(testText).filter(
        (c) => !chars.all.includes(c),
      );
      if (unsupported.length)
        throw Error(`这些字符不在当前基础字库中：${unsupported.join("")}`);
      if (batchMode && provider === "openai") {
        const result = await generateTestSheets(
          target,
          reference,
          style,
          (done, total) => {
            F(`4K 大图生成 ${done}/${total} 字`);
            G(Math.round((done / total) * 85));
          },
          sheetCapacity,
        );
        if (stamp !== sheetCurrent.current)
          throw Error("参数已改变，请重新生成测试字");
        setSheets(result);
        setSheetStamp(sheetCurrent.current);
        setSheetReview(true);
        return;
      }
      const result = await generateTestGlyphs(
        target,
        reference,
        provider,
        style,
        edits,
        (done, total, char) => {
          F(`已完成 ${done}/${total} 字${char ? ` · 当前「${char}」` : ""}`);
          G(Math.round((done / total) * 85));
        },
        async (next) => {
          if (stamp !== sheetCurrent.current)
            throw Error("参数已改变，已停止后续请求");
          E(next);
          await persist({
            ...latestProject.current,
            edits: next,
            updatedAt: Date.now(),
          });
        },
        (phase, done, total, char) =>
          F(
            phase === "request"
              ? `等待 API 返回「${char}」 ${done + 1}/${total}`
              : `平滑矢量化「${char}」 ${done + 1}/${total}`,
          ),
      );
      if (stamp !== sheetCurrent.current)
        throw Error("参数已改变，请重新生成测试字");
      E(result);
      QT("test");
    } catch (e) {
      setGenerationError((e as Error).message);
      B((e as Error).message);
    } finally {
      F("");
    }
  }
  async function acceptSheets() {
    if (sheetStamp !== sheetCurrent.current) {
      B("参数已改变，请重新生成大图");
      return;
    }
    F("切字转矢量");
    try {
      const result = await applySheets(
        sheets,
        style,
        edits,
        (done, total, char) => {
          F(`平滑矢量化「${char}」 ${done}/${total}`);
          G(Math.round((done / total) * 85));
        },
      );
      if (sheetStamp !== sheetCurrent.current)
        throw Error("参数已改变，请重新生成大图");
      E(result);
      setSheetReview(false);
      QT("test");
    } catch (e) {
      B((e as Error).message);
    } finally {
      F("");
    }
  }
  async function smoothExisting() {
    const stamp = signature;
    F("平滑现有样字");
    G(0);
    try {
      const target = [...new Set(Array.from(testText))].filter(
        (c) => !!edits[c]?.sourceImage || !!edits[c]?.pendingGeneration,
      );
      const result = { ...edits };
      for (let i = 0; i < target.length; i++) {
        const c = target[i],
          pending = edits[c].pendingGeneration,
          image = pending?.image || edits[c].sourceImage!,
          traced = await vectorizeDetailed(image);
        result[c] = {
          ...edits[c],
          path: traced.path,
          traceStats: {
            nodes: traced.nodes,
            fidelity: traced.fidelity,
            tolerance: traced.tolerance,
          },
          version: edits[c].version + 1,
          ...(pending
            ? {
                sourceImage: image,
                model: pending.model,
                prompt: pending.prompt,
                createdAt: pending.createdAt,
                generatedStyle: pending.style,
                pendingGeneration: undefined,
              }
            : {}),
        };
        G(Math.round(((i + 1) / target.length) * 85));
      }
      if (stamp !== current.current) throw Error("参数已改变，请重新描摹");
      E(result);
      QT("test");
    } catch (e) {
      B((e as Error).message);
    } finally {
      F("");
    }
  }
  async function build(scope: "test" | "full" | "prepared" = "test") {
    if (scope === "full" && tested !== signature) {
      B("请先生成测试字体并确认风格");
      return null;
    }
    if (!chars.all) {
      B("字库正在加载，请稍后");
      return null;
    }
    const target =
      scope === "full"
        ? chars.all
        : scope === "prepared"
          ? preparedCharacters(edits, chars.all).join("")
          : Array.from(testText)
              .filter((c) => chars.all.includes(c))
              .join("");
    if (!target) {
      B("请先输入基础字库支持的测试文字");
      return null;
    }
    F(
      scope === "full"
        ? "生成完整字库"
        : scope === "prepared"
          ? "打包已完成字形"
          : "生成测试字体",
    );
    G(0);
    const stamp = signature;
    try {
      const r = await createFont(style, edits, target, name, G);
      if (stamp !== current.current) {
        B("参数已变化，请重新生成");
        return null;
      }
      const f = new FontFace("ZifangPreview" + Date.now(), r.buffer);
      await f.load();
      if (face.current) document.fonts.delete(face.current);
      document.fonts.add(f);
      face.current = f;
      H(f.family);
      J(r.buffer);
      K(r.count);
      CV(scope);
      GC(target);
      if (scope === "test" || scope === "prepared") {
        TD(stamp);
        Z(scope === "test" ? "test" : "edited");
        Y(0);
        SS(scope === "test" ? testText : target);
      }
      B(`已生成 ${r.count} 个字符，可试字和下载`);
      return r.buffer;
    } catch (e) {
      B("生成失败：" + (e as Error).message);
      return null;
    } finally {
      F("");
    }
  }
  async function exportFont(type: "ttf" | "otf") {
    if (reference && !fontBuffer) {
      B("请先用参考图生成并检查测试字");
      U("");
      V("create");
      return;
    }
    const b = fontBuffer || (await build("test"));
    if (!b) return;
    F("打包字体");
    try {
      const data = type === "ttf" ? await asTTF(b) : b;
      download(
        data,
        (coverage === "full"
          ? "Zifang-Full."
          : coverage === "prepared"
            ? "Zifang-Partial."
            : "Zifang-Test.") + type,
        type === "ttf" ? "font/ttf" : "font/otf",
      );
      B("字体已下载，请同时保留 OFL 许可证");
    } catch (e) {
      B("导出失败：" + (e as Error).message);
    } finally {
      F("");
    }
  }
  const preferred = COMMON_FIRST;
  const pool =
    filter === "test"
      ? Array.from(new Set(testText))
          .filter((c) => chars.all.includes(c))
          .join("")
      : filter === "batch"
        ? batchCharacters
        : filter === "edited"
          ? Object.keys(edits).join("")
          : filter === "chinese"
            ? [...new Set(preferred + chars.chinese)].join("")
            : filter === "latin"
              ? chars.latin
              : chars.punctuation;
  const items = Array.from(
    query
      ? pool
          .split("")
          .filter(
            (c) =>
              query.includes(c) ||
              c.codePointAt(0)!.toString(16).includes(query.toLowerCase()),
          )
          .join("")
      : pool,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">字</span>
          <strong>
            FontReal<span>中文字体设计工作室</span>
          </strong>
        </a>
        <button className="new-button" disabled={!!busy} onClick={fresh}>
          <Plus size={17} />
          新建字体
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            disabled={!!busy}
            className={view === "create" ? "active" : ""}
            onClick={() => V("create")}
          >
            <Sparkles size={18} />
            字体创作<span className="mini">AI</span>
          </button>
          <button
            disabled={!!busy}
            className={view === "glyphs" ? "active" : ""}
            onClick={() => V("glyphs")}
          >
            <Grid2X2 size={18} />
            字符工坊
          </button>
          <button
            disabled={!!busy}
            className={view === "standard" ? "active" : ""}
            onClick={() => V("standard")}
          >
            <LibraryBig size={18} />
            GB2312 国标字库
            <span className="mini">7,445</span>
          </button>
          <button
            disabled={!!busy}
            className={view === "preview" ? "active" : ""}
            onClick={() => V("preview")}
          >
            <Type size={18} />
            在线试字
          </button>
          <button
            disabled={!!busy}
            className={view === "library" ? "active" : ""}
            onClick={library}
          >
            <FolderOpen size={18} />
            我的字库
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="language-note">
            <span>为中文而生</span>
            <p>
              国标 GB2312 字符集
              <br />
              一级 3,755 · 二级 3,008。
            </p>
            <span className="little-seal">字</span>
          </div>
          <a className="legacy-launch" href="/tools/zijing-classic-editor.html" target="_blank" rel="noopener noreferrer">
            <FileType size={17} />
            经典钢笔 / 矩形绘制器
            <ArrowUpRight size={14} />
          </a>
          <button onClick={() => U("guide")}>
            <BookOpen size={17} />
            使用指南
            <ArrowUpRight size={14} />
          </button>
          <button onClick={() => U("settings")}>
            <Settings2 size={17} />
            AI 服务设置
            <span className={"dot " + (configured ? "green" : "")} />
          </button>
          <div className="sidebar-foot">
            FONTREAL <span>V5.0 · Full Edition</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            工作空间
            <ChevronRight size={14} />
            <input
              aria-label="字体项目名称"
              value={name}
              onChange={(e) => N(e.target.value)}
            />
            <span className="draft">{saved ? "已保存" : "草稿"}</span>
          </div>
          <div className="project-actions">
            <button
              onClick={() => projectInput.current?.click()}
              disabled={!!busy}
            >
              <Upload size={14} />
              导入项目
            </button>
            <button onClick={exportProject} disabled={!!busy}>
              <Download size={14} />
              导出项目
            </button>
            <button onClick={save} disabled={!!busy} className="save-button">
              <Check size={15} />
              {saved ? "已保存" : "保存项目"}
            </button>
          </div>
          <input
            ref={projectInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="选择字坊项目文件"
            onChange={(e) => importProject(e.target.files?.[0])}
          />
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                AI FONT GENERATOR
              </div>
              <h1>
                {view === "create"
                  ? "把灵感，写成一种字体。"
                  : view === "glyphs"
                    ? "每个字，都值得雕琢。"
                    : view === "standard"
                      ? "国标字库，每一字都有据可查。"
                    : view === "preview"
                      ? "让文字，成为你的表达。"
                      : "属于你的字体收藏。"}
              </h1>
              <p>
                {view === "create"
                  ? "从一张图片，或一句描述开始，创造你的专属中文字体。"
                  : view === "glyphs"
                    ? "查看基础字符，逐字调整字体结构与轮廓。"
                    : view === "standard"
                      ? "GB2312-1980 一级 3,755 字、二级 3,008 字及符号 682 个；字库有字符不等于有字形。"
                    : view === "preview"
                      ? "在真实的文字里，找到最合适的字形与节奏。"
                      : "项目保存在当前浏览器，随时回来继续创作。"}
              </p>
            </div>
            <button className="status" onClick={() => U("settings")}>
              <span className={"dot " + (configured ? "green" : "")} />
              {configured ? "AI 服务已配置" : "基础风格模式"}
              <ChevronRight size={13} />
            </button>
          </section>
          {view !== "library" && (
            <div className="work-tabs">
              {[
                ["create", "创作工作区"],
                ["glyphs", "字符工坊"],
                ["standard", "GB2312 字库"],
                ["preview", "在线试字"],
              ].map(([key, label], i) => (
                <button
                  key={key}
                  disabled={!!busy}
                  className={view === key ? "selected" : ""}
                  onClick={() => V(key)}
                >
                  <span>0{i + 1}</span>
                  {label}
                  {key === "glyphs" && (
                    <small>{fontBuffer ? count : "3,893"}</small>
                  )}
                  {key === "standard" && <small>7,445</small>}
                </button>
              ))}
              <div className="tab-note">中文 · LATIN · 0123</div>
            </div>
          )}
          {view === "create" && (
            <>
              <div className="workspace">
                <div className="canvas-column">
                  <div className="type-canvas">
                    <div className="canvas-top">
                      <span>
                        <span className="dot green" />
                        实时字形预览
                      </span>
                      <span>
                        中文创作 · {style.base === "sans" ? "黑体" : "宋体"}
                      </span>
                    </div>
                    <div
                      className={
                        "hero-type" +
                        (testCharacters(testText).length > 16 ? " dense" : "")
                      }
                    >
                      {previewRows(testText, sheetCapacity).map((line, i) => (
                        <div
                          key={i}
                          style={
                            testCharacters(testText).length > 16
                              ? {
                                  gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                                }
                              : undefined
                          }
                        >
                          {line.map((c, j) => (
                            <Glyph
                              key={j}
                              char={c}
                              style={style}
                              edits={edits}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="canvas-bottom">
                      <span>YOUR WORDS. YOUR WORLD.</span>
                      <button onClick={() => V("preview")}>
                        输入文字试试看
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="corner c1" />
                    <div className="corner c2" />
                    <div className="corner c3" />
                    <div className="corner c4" />
                  </div>
                  <label className="test-input">
                    <span>
                      测试预览文字
                      <small>
                        最多 72 个字 · 当前 {testCharacters(testText).length}{" "}
                        个不同字
                      </small>
                    </span>
                    <textarea
                      aria-label="测试预览文字"
                      maxLength={SHEET.capacity * 2 + SHEET.rows}
                      value={testText}
                      onChange={(e) => TX(limitTestText(e.target.value))}
                    />
                    <button
                      type="button"
                      className="fill-test"
                      disabled={!!busy}
                      onClick={() => TX(DEFAULT_TEST_TEXT)}
                    >
                      填入 72 个常用测试字
                    </button>
                  </label>
                  <div className="coverage">
                    <div className="coverage-icon">
                      <Type size={23} />
                    </div>
                    <div>
                      <strong>不止几个字，是一整套字库。</strong>
                      <p>以日常通用字库为基础，保留汉字结构，统一字体风格。</p>
                    </div>
                    <span>
                      3,755<small>常用汉字</small>
                    </span>
                    <span>
                      Aa<small>英文与数字</small>
                    </span>
                  </div>
                  <div className="section-label">
                    <strong>从一种风格开始</strong>
                    <span>
                      选择灵感，继续打磨 <ArrowUpRight size={13} />
                    </span>
                  </div>
                  <div className="presets">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        className="preset"
                        onClick={() => S(p.style)}
                      >
                        <div style={{ background: p.color }}>
                          {Array.from(p.sample).map((c, i) => (
                            <Glyph key={i} char={c} style={p.style} />
                          ))}
                        </div>
                        <strong>
                          {p.name}
                          <ArrowUpRight size={13} />
                        </strong>
                        <small>{p.en}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="controls-card">
                  <div className="card-heading">
                    <strong>你的字体，从这里开始</strong>
                    <Sparkles size={17} />
                  </div>
                  <div className="input-tabs">
                    <button
                      className={mode === "image" ? "selected" : ""}
                      onClick={() => M("image")}
                    >
                      <ImagePlus size={15} />
                      图片生字
                    </button>
                    <button
                      className={mode === "text" ? "selected" : ""}
                      onClick={() => M("text")}
                    >
                      <Type size={15} />
                      文字生字
                    </button>
                  </div>
                  {mode === "image" ? (
                    <div
                      className={
                        "upload-zone " + (reference ? "has-image" : "")
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" && input.current?.click()
                      }
                      onClick={() => input.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        upload(e.dataTransfer.files[0]);
                      }}
                    >
                      {reference ? (
                        <>
                          <img src={reference} alt="字体参考图" />
                          <span className="replace">点击更换参考图</span>
                        </>
                      ) : (
                        <>
                          <span className="upload-icon">
                            <ImagePlus size={24} />
                            <Plus size={11} />
                          </span>
                          <strong>拖入一张字体参考图</strong>
                          <p>
                            或 <em>点击上传</em>
                          </p>
                          <small>PNG、JPG、WEBP · 最大 12 MB</small>
                        </>
                      )}
                    </div>
                  ) : (
                    <textarea
                      className="prompt"
                      aria-label="字体风格描述"
                      placeholder="例如：温暖、圆润的中文黑体，像周末街角咖啡店的招牌……"
                      value={prompt}
                      onChange={(e) => P(e.target.value)}
                    />
                  )}
                  {mode === "image" && (
                    <div className="paste-row">
                      <button disabled={!!busy} onClick={pasteImage}>
                        <ClipboardPaste size={13} />
                        粘贴图片
                      </button>
                      <span>⌘V / Ctrl+V · 支持截图</span>
                    </div>
                  )}
                  <input
                    ref={input}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="analyze-button"
                    disabled={!!busy}
                    onClick={analyze}
                  >
                    <Sparkles size={14} />
                    {configured ? "AI 分析风格" : "连接 AI 分析参考"}
                    <ArrowUpRight size={13} />
                  </button>
                  {analysis && (
                    <div className="analysis">
                      <p>{analysis.description}</p>
                      <div>
                        {analysis.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <label>
                        识别字符（可修正）
                        <input
                          value={analysis.characters
                            .map((c) => c.character)
                            .join("")}
                          onChange={(e) =>
                            A({
                              ...analysis,
                              characters: Array.from(e.target.value).map(
                                (character) => ({
                                  character,
                                  x: 0,
                                  y: 0,
                                  width: 1,
                                  height: 1,
                                }),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div className="control-title">
                    <SlidersHorizontal size={15} />
                    <strong>微调你的风格</strong>
                    <button title="重置参数" onClick={() => S(DEFAULT_STYLE)}>
                      <RotateCcw size={13} />
                    </button>
                  </div>
                  <div className="base-toggle">
                    <span>基础字形</span>
                    <div>
                      {[
                        ["sans", "黑体"],
                        ["serif", "宋体"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          className={style.base === v ? "selected" : ""}
                          onClick={() => change("base", v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(
                    [
                      ["weight", "字重", 0, 3, 1],
                      ["width", "字宽", 70, 130, 1],
                      ["roundness", "圆角", 0, 100, 1],
                      ["slant", "倾斜", -15, 15, 1],
                    ] as const
                  ).map(([key, label, min, max, step]) => (
                    <label className="slider" key={key}>
                      <span>
                        {label}
                        <b>
                          {style[key]}
                          {key === "width" ? "%" : key === "slant" ? "°" : ""}
                        </b>
                      </span>
                      <input
                        aria-label={label}
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={
                          key === "weight"
                            ? [300, 400, 600, 800].indexOf(
                                [300, 400, 600, 800].reduce((a, b) =>
                                  Math.abs(b - style.weight) <
                                  Math.abs(a - style.weight)
                                    ? b
                                    : a,
                                ),
                              )
                            : style[key]
                        }
                        onChange={(e) =>
                          change(
                            key,
                            key === "weight"
                              ? [300, 400, 600, 800][+e.target.value]
                              : +e.target.value,
                          )
                        }
                      />
                    </label>
                  ))}
                  <div className="charset-label">
                    生成字符集<span>已包含</span>
                  </div>
                  <div className="charset-tags">
                    <span>
                      <Check size={12} />
                      常用汉字 3,755
                    </span>
                    <span>
                      <Check size={12} />
                      英文 / 数字
                    </span>
                    <span>
                      <Check size={12} />
                      中英标点
                    </span>
                  </div>
                  {reference && provider === "openai" && (
                    <div className="batch-options">
                      <span>测试生成方式</span>
                      <div>
                        <button
                          disabled={!!busy}
                          aria-pressed={batchMode}
                          className={batchMode ? "active" : ""}
                          onClick={() => setBatchMode(true)}
                        >
                          4K 大图批量
                        </button>
                        <button
                          disabled={!!busy}
                          aria-pressed={!batchMode}
                          className={!batchMode ? "active" : ""}
                          onClick={() => setBatchMode(false)}
                        >
                          逐字生成
                        </button>
                      </div>
                      {batchMode && (
                        <div>
                          {([72, 32] as const).map((cap) => (
                            <button
                              key={cap}
                              disabled={!!busy}
                              className={sheetCapacity === cap ? "active" : ""}
                              onClick={() => {
                                setSheetCapacity(cap);
                                TX(limitTestText(DEFAULT_TEST_TEXT, cap));
                              }}
                            >
                              {cap} 字 / 张
                            </button>
                          ))}
                        </div>
                      )}
                      {batchMode ? (
                        <small>
                          每图最多 {sheetCapacity} 字 · {layout.columns}×
                          {layout.rows} 格 · 每格{" "}
                          {layout.width / layout.columns}×
                          {layout.height / layout.rows}
                          <br />
                          当前 {testCharacters(testText).length} 字，预计{" "}
                          {testCharacters(testText).length
                            ? Math.ceil(
                                testCharacters(testText).length / sheetCapacity,
                              )
                            : 0}{" "}
                          张 4K 大图
                        </small>
                      ) : (
                        <small>
                          逐字 1K · 每字一张 1024×1024 · low
                          <br />
                          当前 {singlePlan.characters.length} 字 · 已完成{" "}
                          {singlePlan.completed.length} 字
                          <br />
                          待描摹 {singlePlan.images.length} 字 · 预计仅新增{" "}
                          {singlePlan.requests.length} 次请求
                          <br />
                          中断后点击下方继续，自动跳过已完成字；已有图片先恢复描摹。
                        </small>
                      )}
                    </div>
                  )}
                  <button
                    className="primary generate"
                    disabled={!!busy || !chars.all}
                    onClick={generatePreview}
                  >
                    <Sparkles size={17} />
                    {busy ||
                      (reference
                        ? batchMode && provider === "openai"
                          ? `生成 ${testCharacters(testText).length} 字测试大图`
                          : singlePlan.remaining.length === 0
                            ? `打包已有 ${singlePlan.completed.length} 字 · 无需生成`
                            : singlePlan.completed.length ||
                                singlePlan.images.length
                              ? `继续生成剩余 ${singlePlan.remaining.length} 字`
                              : `开始逐字生成 ${singlePlan.characters.length} 字`
                        : "先生成测试字体")}
                    {!busy && <ArrowUpRight size={17} />}
                  </button>
                  {busy && <progress value={progress} max={100} />}
                  {busy && (
                    <div className="generation-state" role="status">
                      <strong>{busy}</strong>
                      <span>已等待 {busySeconds} 秒 · 请保持当前页面打开</span>
                    </div>
                  )}
                  {generationError && (
                    <div className="generation-error" role="alert">
                      <strong>生成未完成</strong>
                      <p>{generationError}</p>
                      <span>
                        已完成字形会自动跳过；已有图片会优先描摹，点击继续只请求缺少的字。可保存或导出项目后恢复。
                      </span>
                    </div>
                  )}
                  {!!Object.keys(edits).length && (
                    <a className="continue-expansion" href="#expand-font">
                      保留测试字，继续分批扩字 <ChevronRight size={14} />
                    </a>
                  )}
                  {!!sheets.length && sheetStamp === sheetSignature && (
                    <button
                      className="wide"
                      disabled={!!busy}
                      onClick={() => setSheetReview(true)}
                    >
                      查看大图与切字结果
                    </button>
                  )}
                  {testText.trim() &&
                    Array.from(testText)
                      .filter((c) => c.trim())
                      .every((c) => !!edits[c]?.path) && (
                      <button
                        className="wide"
                        disabled={!!busy}
                        onClick={() => build("test")}
                      >
                        用当前字形打包测试字体
                      </button>
                    )}
                  {Array.from(testText).some(
                    (c) =>
                      !!edits[c]?.sourceImage || !!edits[c]?.pendingGeneration,
                  ) && (
                    <button
                      className="wide"
                      disabled={!!busy}
                      onClick={smoothExisting}
                    >
                      平滑现有测试字 · 无需再次生成
                    </button>
                  )}
                  {tested === signature && coverage !== "full" && (
                    <button
                      className="confirm-full wide"
                      disabled={!!busy}
                      onClick={() => build("full")}
                    >
                      <Check size={15} />
                      {reference
                        ? "保留样字，补齐基础字库"
                        : "确认风格，生成完整字库"}
                    </button>
                  )}
                  <p className="control-foot">
                    {reference &&
                      tested === signature &&
                      "完整补齐使用基础字库，尚未逐字 AI 重绘。"}
                    {fontBuffer
                      ? coverage === "test"
                        ? `已生成 ${count} 个测试字，请检查风格`
                        : coverage === "prepared"
                          ? `已打包 ${count} 个定制字形`
                          : "完整字库已就绪"
                      : "先生成预览中的测试字，确认后再扩字"}
                  </p>
                </div>
              </div>
              <ExpansionPanel
                value={expansion}
                onChange={setExpansion}
                edits={edits}
                charset={chars}
                style={style}
                reference={reference}
                provider={provider}
                configured={configured}
                busy={busy}
                setBusy={F}
                setProgress={G}
                onCheckpoint={async (value, nextEdits) => {
                  const data = {
                    ...latestProject.current,
                    expansion: value,
                    ...(nextEdits ? { edits: nextEdits } : {}),
                    updatedAt: Date.now(),
                  };
                  setExpansion(value);
                  if (nextEdits) E(nextEdits);
                  try {
                    await persist(data);
                  } catch {
                    throw Error(
                      "自动保存失败，请检查浏览器存储空间并保存项目后继续",
                    );
                  }
                }}
                onInspect={(characters) => {
                  setBatchCharacters(characters.join(""));
                  Z("batch");
                  Y(0);
                  V("glyphs");
                }}
                onPackage={() => build("prepared")}
              />
              <div className="workflow">
                <span>从灵感到字体，只需三步</span>
                <div>
                  <b>01</b>上传参考 / 描述风格
                  <ChevronRight size={14} />
                  <b>02</b>生成与打磨字符
                  <ChevronRight size={14} />
                  <b>03</b>试字并导出字体
                  <ArrowUpRight size={16} />
                </div>
              </div>
            </>
          )}
          {view === "standard" && (
            <section className="gb-workspace">
              <div className="gb-hero">
                <div><span className="eyebrow">GB2312—1980 / NATIONAL CHARACTER SET</span>
                  <h2>从 3,755 到 7,445。<br/>每一笔，都有归处。</h2>
                  <p>这里是字符集与字形工作区。标准定义编码，不会凭空生成任何缺失的字形。</p>
                </div>
                <div className="gb-stats"><strong>7,445</strong><span>标准字符总数</span>
                  <div>一级 3,755　·　二级 3,008　·　符号 682</div>
                </div>
              </div>
              <div className="gb-tool-row">
                <label>字符范围
                  <select aria-label="GB2312 字库范围" value={gbScope} onChange={e=>{setGbScope(e.target.value as GbScope);setGbPage(0);setGbQuery("");}}>
                    {GB_SCOPES.map(scope=><option key={scope.key} value={scope.key}>{scope.title}{scope.count?` · ${scope.count.toLocaleString("zh-CN")}`:""}</option>)}
                  </select>
                </label>
                <label>查找文字 / Unicode / 区位码
                  <input aria-label="检索国标字" value={gbQuery} onChange={e=>{setGbQuery(e.target.value);setGbPage(0);}} placeholder="例：中、4E2D、D6D0、54-48"/>
                </label>
                <label className="gb-font-upload"><FileType size={16}/>{sourceFile?`已载入：${sourceFile}`:"上传 TTF / OTF 字体底库"}
                  <input type="file" hidden accept=".ttf,.otf" onChange={e=>{void loadSourceFile(e.target.files?.[0]);e.target.value="";}}/>
                </label>
                {sourceFile&&<button className="gb-clear" onClick={()=>{clearSourceFont();setSourceFile("");setBaseRevision(n=>n+1);S(v=>({...v}));}}>恢复内置基础字体</button>}
              </div>
              {gbScope==="custom"&&<textarea aria-label="自定义 GB2312 文字" className="gb-custom" value={gbCustom} onChange={e=>{setGbCustom(e.target.value);setGbPage(0);}}/>}
              <div className="gb-coverage">
                <div><strong>{(gbResult?.covered ?? 0).toLocaleString("zh-CN")}</strong><span>有可用轮廓</span></div>
                <div><strong>{(gbResult?.missing.length ?? 0).toLocaleString("zh-CN")}</strong><span>当前缺字</span></div>
                <div><strong>{(gbResult?.wanted??0).toLocaleString("zh-CN")}</strong><span>目标字符</span></div>
                <p><AlertTriangle size={16}/>GB2312 只规定字符编码。若当前底库没有二级汉字，需逐字绘制或上传有授权的完整字体。上传底库仅在当前页面会话有效。</p>
              </div>
              <div className="gb-actions">
                <button onClick={()=>exportGbTable("txt")} disabled={!gb}>导出字符 TXT</button>
                <button onClick={()=>exportGbTable("csv")} disabled={!gb}>导出编码 CSV</button>
                <button className="primary" onClick={()=>void exportGbFont("ttf")} disabled={gbBusy||!gb}>{gbBusy?`编译中 ${progress}%`:"生成 TTF + 缺字报告"}</button>
                <button className="primary" onClick={()=>void exportGbFont("otf")} disabled={gbBusy||!gb}>{gbBusy?`编译中 ${progress}%`:"生成 OTF + 缺字报告"}</button>
              </div>
              <div className="gb-list-meta"><span>{gb?`${gbFiltered.length.toLocaleString("zh-CN")} 个匹配字符 · 第 ${gbPage+1} 页`:"正在加载国标编码表…"}</span><span>点击字形进入单字编辑 · 缺字会标注</span></div>
              <div className="gb-grid">
                {gbFiltered.slice(gbPage*72,(gbPage+1)*72).map(c=>{
                  const record=gbRecords.get(c),missing=!!gbResult?.missing.includes(c);
                  return <button key={c} className={missing?"gb-cell gb-missing":"gb-cell"} onClick={()=>D(c)} disabled={gbBusy}>
                    <strong>{missing&&!edits[c]?.path?"□":c}</strong><span>{c} · {record?.gb||"自定义"}</span>{missing&&<i>缺字</i>}
                  </button>;
                })}
              </div>
              <div className="pagination"><span>第 {gbPage+1} / {Math.max(1,Math.ceil(gbFiltered.length/72))} 页</span>
                <button disabled={gbPage===0} onClick={()=>setGbPage(n=>Math.max(0,n-1))}>上一页</button>
                <button disabled={(gbPage+1)*72>=gbFiltered.length} onClick={()=>setGbPage(n=>n+1)}>下一页</button>
              </div>
              <p className="gb-bottom-note">预设字体提供常用字的实际轮廓；导出前会依据所选底库和编辑路径核对覆盖率。缺字报告中的字不会被虚假补齐。</p>
            </section>
          )}
          {view === "glyphs" && (
            <section className="glyph-section">
              <div className="glyph-toolbar">
                <div>
                  {[
                    ["test", "测试字"],
                    ["batch", "本批字"],
                    ["chinese", "常用汉字"],
                    ["latin", "英文 / 数字"],
                    ["punctuation", "标点符号"],
                    ["edited", "已定制"],
                  ].map(([key, l]) => (
                    <button
                      className={filter === key ? "selected" : ""}
                      key={key}
                      onClick={() => {
                        Z(key);
                        Y(0);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="搜索字符"
                  placeholder="搜索字符或 Unicode"
                  value={query}
                  onChange={(e) => {
                    W(e.target.value);
                    Y(0);
                  }}
                />
              </div>
              <div className="grid-note">
                <span>
                  {fontBuffer
                    ? coverage === "test"
                      ? `测试已生成 ${count} 个`
                      : coverage === "prepared"
                        ? `已打包 ${count} 个定制字形`
                        : "完整字库已生成"
                    : "基础字形"}{" "}
                  · 共 {items.length} 个字符
                </span>
                <span>点击字形编辑 · 下方按钮直接重绘</span>
              </div>
              <div className="glyph-grid">
                {items.slice(page * 64, page * 64 + 64).map((c) => (
                  <div key={c} className="glyph-card">
                  <button className="glyph-open" aria-label={`编辑「${c}」`} disabled={!!busy} onClick={() => D(c)}>
                    <Glyph char={c} style={style} edits={edits} />
                    <div>
                      <span>
                        U+{c.codePointAt(0)!.toString(16).toUpperCase()}
                      </span>
                      <i
                        className={
                          edits[c]
                            ? "edited"
                            : generatedChars.includes(c) && fontBuffer
                              ? "generated"
                              : ""
                        }
                      />
                    </div>
                  </button>
                  <button className="glyph-redraw" aria-label={`重新重绘「${c}」`} disabled={!!busy} onClick={() => redrawFromCard(c)}><Sparkles size={12} /><span>{redrawingChar === c ? "重绘中…" : "重新重绘"}</span></button>
                  </div>
                ))}
              </div>
              {!items.length && (
                <div className="empty">没有匹配的字符，试试调整筛选条件。</div>
              )}
              <div className="pagination">
                <span>
                  第 {page + 1} / {Math.max(1, Math.ceil(items.length / 64))} 页
                </span>
                <button disabled={page === 0} onClick={() => Y(page - 1)}>
                  上一页
                </button>
                <button
                  disabled={(page + 1) * 64 >= items.length}
                  onClick={() => Y(page + 1)}
                >
                  下一页
                </button>
              </div>
            </section>
          )}
          {view === "preview" && (
            <section className="preview-section">
              <div className="preview-controls">
                <label>
                  字号
                  <input
                    type="range"
                    min="16"
                    max="120"
                    value={size}
                    onChange={(e) => SZ(+e.target.value)}
                  />
                  {size}px
                </label>
                <label>
                  字距
                  <input
                    type="range"
                    min="-2"
                    max="16"
                    value={space}
                    onChange={(e) => SP(+e.target.value)}
                  />
                  {space}px
                </label>
                <label>
                  行距
                  <select value={line} onChange={(e) => LI(+e.target.value)}>
                    {[1.2, 1.5, 1.7, 2, 2.5].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => DK(!dark)}>
                  {dark ? "浅色背景" : "深色背景"}
                </button>
                <label>文字颜色 <input aria-label="文字颜色" type="color" value={inkColor} onChange={e=>setInkColor(e.target.value)}/></label>
                <label>背景颜色 <input aria-label="背景颜色" type="color" value={paperColor} onChange={e=>setPaperColor(e.target.value)}/></label>
                <button onClick={()=>void exportPoster("png",2048)}>导出 2K PNG</button>
                <button onClick={()=>void exportPoster("png",3840)}>导出 4K PNG</button>
                <button onClick={()=>void exportPoster("svg")}>导出 SVG</button>
              </div>
              <textarea
                aria-label="输入试字内容"
                className={"type-tester " + (dark ? "dark" : "")}
                style={{
                  fontFamily: family || `Zifang${style.base}`,
                  fontSize: size,
                  letterSpacing: space,
                  lineHeight: line,
                  fontWeight: family ? 400 : style.weight,
                  color:dark?"#f2f3f0":inkColor,
                  backgroundColor:dark?"#292e2c":paperColor,
                }}
                value={sample}
                onChange={(e) => SS(e.target.value)}
              />
              {[...new Set(Array.from(sample))].filter(
                (c) =>
                  !(fontBuffer ? generatedChars : chars.all).includes(c) &&
                  !["\n", "\r", "\t"].includes(c),
              ).length > 0 && (
                <p className="warning">
                  以下字符超出当前生成字集，将显示系统回退字形：
                  {[...new Set(Array.from(sample))]
                    .filter(
                      (c) =>
                        !(fontBuffer ? generatedChars : chars.all).includes(
                          c,
                        ) && !["\n", "\r", "\t"].includes(c),
                    )
                    .join(" ")}
                </p>
              )}
              <div className="export-bar">
                <div>
                  <strong>
                    {fontBuffer
                      ? coverage === "test"
                        ? "测试字体预览已生效"
                        : coverage === "prepared"
                          ? `已完成的 ${count} 字预览已生效`
                          : "完整字体预览已生效"
                      : "当前为基础字形预览"}
                  </strong>
                  <p>
                    {fontBuffer
                      ? `${count} 个字符 · 1000 UPM · 可安装字体`
                      : "生成字库后，试字将包含全部风格参数与单字修改。"}
                  </p>
                </div>
                <button disabled={!!busy} onClick={generatePreview}>
                  {fontBuffer ? "重新生成" : "应用风格并生成"}
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => U("export")}
                >
                  <Download size={16} />
                  导出字体
                </button>
              </div>
            </section>
          )}
          {view === "library" && (
            <>
              <div className="project-portability">
                <p>
                  本地项目仅在当前浏览器保存。跨浏览器或电脑继续时，先导出项目
                  JSON，再在这里导入。
                </p>
                <button
                  disabled={!!busy}
                  onClick={() => projectInput.current?.click()}
                >
                  <Upload size={14} />
                  导入项目 JSON
                </button>
              </div>
              <div className="project-grid">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => open(p)}>
                    <div>
                      {Array.from("字有新生").map((c) => (
                        <Glyph key={c} char={c} style={p.style} />
                      ))}
                    </div>
                    <strong>{p.name}</strong>
                    <p>
                      {new Date(p.updatedAt).toLocaleDateString("zh-CN")} ·{" "}
                      {Object.keys(p.edits).length} 个字符编辑
                    </p>
                    <span>
                      继续创作 <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
                <button className="new-project" onClick={fresh}>
                  <Plus size={32} />
                  <strong>开始一个新字体</strong>
                  <p>从今天的一个灵感开始</p>
                </button>
              </div>
            </>
          )}
          <footer>
            <span>让每个字，都有自己的表达。</span>
            <span>FONTREAL · MADE FOR CHINESE TYPOGRAPHY</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => B("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div className="overlay" onClick={() => U("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "settings"
                ? "AI 服务设置"
                : modal === "export"
                  ? "导出字体"
                  : "使用指南"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="关闭弹窗"
              onClick={() => U("")}
            >
              <X size={20} />
            </button>
            {modal === "settings" ? (
              <>
                <div className="eyebrow">AI CONNECTION</div>
                <h2>AI 服务设置</h2>
                <p>选择已在服务器配置的服务。密钥不会存储在浏览器。</p>
                {(["openai", "gemini"] as const).map((p) => (
                  <button
                    key={p}
                    className={"provider " + (provider === p ? "selected" : "")}
                    onClick={() => Q(p)}
                  >
                    <strong>
                      {p === "openai" ? "GPT Image · 302.AI" : "Google Gemini"}
                    </strong>
                    <span className={"dot " + (status[p] ? "green" : "")} />
                    {status[p] ? "已配置" : "未配置"}
                  </button>
                ))}
                <div className="info-box">
                  GPT Image 支持 4K 大图批量测试和单字重绘。Gemini
                  使用逐字生成。密钥由服务器保管。
                </div>
                <details>
                  <summary>开发者配置说明</summary>
                  <p>
                    在服务器环境中设置 <code>OPENAI_API_KEY</code> 或{" "}
                    <code>GEMINI_API_KEY</code>{" "}
                    后重新部署。可通过环境变量覆盖分析与图像模型。使用 OpenAI
                    托管密钥时，请启用 OpenAI Developers 插件。
                  </p>
                </details>
                <button className="primary wide" onClick={() => U("")}>
                  完成
                </button>
              </>
            ) : modal === "export" ? (
              <>
                <div className="eyebrow">READY TO TYPE</div>
                <h2>把你的字体，带到更多地方。</h2>
                <p>
                  {coverage === "full"
                    ? "当前导出内置常用基础字库（约 3,893 字符）。完整 GB2312 请到「GB2312 国标字库」按范围导出。"
                    : coverage === "prepared"
                      ? `当前导出累计完成的 ${count} 个定制字形，后续批次可继续合入。`
                      : "当前只导出预览中的测试字。确认风格后，再生成完整字库。"}
                </p>
                <div className="export-options">
                  {(["ttf", "otf"] as const).map((t) => (
                    <button
                      disabled={!!busy}
                      key={t}
                      onClick={() => exportFont(t)}
                    >
                      <Type size={26} />
                      <strong>{t.toUpperCase()}</strong>
                      <span>
                        {t === "ttf" ? "Windows / macOS 通用" : "专业设计工具"}
                      </span>
                      <Download size={18} />
                    </button>
                  ))}
                </div>
                {busy && (
                  <p>
                    {busy} {progress}%
                  </p>
                )}
                <p className="license-note">
                  {sourceFile ? "使用上传字体时须遵循原字体授权许可。" : "内置 Noto 派生字体沿用 SIL OFL 1.1 许可。"}
                  <a href="/fonts/OFL-Sans.txt" download>
                    下载黑体许可
                  </a>{" "}
                  ·{" "}
                  <a href="/fonts/OFL-Serif.txt" download>
                    下载宋体许可
                  </a>
                </p>
                <button
                  className="wide"
                  onClick={() =>
                    download(
                      JSON.stringify({ name, style, edits, analysis }, null, 2),
                      "Zifang-project.json",
                      "application/json",
                    )
                  }
                >
                  导出风格与字符数据 JSON
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow">A LITTLE GUIDE</div>
                <h2>从灵感，到你的第一款字体。</h2>
                <ol className="guide">
                  <li>
                    <strong>选择你的起点</strong>
                    <p>
                      上传清晰参考图，或输入风格描述；连接 AI
                      后可分析风格。也可以直接选择预设。
                    </p>
                  </li>
                  <li>
                    <strong>统一风格，细调每个字</strong>
                    <p>
                      以内置一级常用汉字为基础调整字重、字宽、圆角和倾斜。字符工坊支持缩放、旋转、位移与图片矢量化。
                    </p>
                  </li>
                  <li>
                    <strong>生成、试字、导出</strong>
                    <p>
                      生成后在真实段落中预览，下载 TTF 或
                      OTF，双击字体文件安装。当前版本不含繁体全集与生僻字。
                    </p>
                  </li>
                </ol>
                <div className="info-box">
                  少量参考字无法保证整套中文的精确风格复现。当前 MVP
                  使用基础字库保持结构一致，AI 重绘的单字请在应用前检查笔画。
                </div>
                <button className="primary wide" onClick={() => U("")}>
                  开始创作
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {sheetReview && (
        <SheetReview
          sheets={sheets}
          reference={reference}
          style={style}
          onChange={setSheets}
          onApply={acceptSheets}
          onClose={() => setSheetReview(false)}
          busy={!!busy}
        />
      )}
      {selected && (
        <Editor
          character={selected}
          glyphCharacters={gb?.all || chars.all}
          style={style}
          edits={edits}
          reference={reference}
          provider={provider}
          configured={configured}
          onClose={() => D("")}
          onSave={(edit) => {
            E({ ...edits, [selected]: edit });
            D("");
            B("字符修改已保存，请重新生成字库以应用到导出");
          }}
        />
      )}
    </div>
  );
}
