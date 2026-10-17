"use client";
import { useState } from "react";
import { X, Download, Check, RotateCcw } from "lucide-react";
import type { GlyphSheet } from "@/lib/font/sheet";
import type { StyleConfig } from "@/lib/font/types";
export default function SheetReview({
  sheets,
  reference,
  style,
  onChange,
  onApply,
  onClose,
  busy,
  expansion = false,
  provider = "openai",
}: {
  sheets: GlyphSheet[];
  reference: string;
  style: StyleConfig;
  onChange: (s: GlyphSheet[]) => void;
  onApply: () => void;
  onClose: () => void;
  busy: boolean;
  expansion?: boolean;
  provider?: string;
}) {
  const [redrawing, setRedrawing] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function redraw(si: number, ci: number) {
    const cell = sheets[si].cells[ci];
    setRedrawing(cell.character);
    setError("");
    setConfirmed(false);
    try {
      const response = await fetch("/api/glyph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          character: cell.character,
          style,
          image: reference,
          variation: 1,
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw Error(data.error || "单字重绘失败");
      onChange(
        sheets.map((sheet, i) =>
          i !== si
            ? sheet
            : {
                ...sheet,
                cells: sheet.cells.map((c, j) =>
                  j !== ci
                    ? c
                    : {
                        ...c,
                        image: data.image,
                        warning: "",
                        regenerated: {
                          model: data.model,
                          prompt: data.prompt,
                          createdAt: data.createdAt,
                        },
                      },
                ),
              },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedrawing("");
    }
  }
  const pending = busy || !!redrawing;
  const warnings = sheets.some((s) => s.cells.some((c) => c.warning));
  return (
    <div className="overlay">
      <section
        className="modal sheet-review"
        role="dialog"
        aria-modal="true"
        aria-label={expansion ? "扩字批次核对" : "批量切字核对"}
      >
        <button
          className="close"
          aria-label="关闭批量预览"
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="eyebrow">SHEET → GLYPHS</div>
        <h2>
          {expansion ? "这批新字，检查后再使用。" : "一张大图，逐字核对。"}
        </h2>
        <p>
          {expansion
            ? "确认后合入已有字库，下一批由你手动开始。"
            : "已按原始排版定位切割。"}
          请核对字符、完整笔画和风格；空白与越界检查无法识别错字。问题字可以单独重绘。
        </p>
        {sheets.map((sheet, si) => (
          <div key={si} className="sheet-result">
            <a
              className="sheet-download"
              href={sheet.image}
              download={`glyph-sheet-${si + 1}.png`}
            >
              <Download size={14} />
              下载原始图片 · {sheet.width}×{sheet.height} · {sheet.cells.length}{" "}
              字 ·{" "}
              {sheet.layout?.columns ||
                Math.round(1 / sheet.cells[0].slot.width)}
              ×
              {sheet.layout?.rows || Math.round(1 / sheet.cells[0].slot.height)}{" "}
              格
            </a>
            <img
              className="sheet-original"
              src={sheet.image}
              alt={`第 ${si + 1} 张原始生成大图`}
            />
            <div className="sheet-cells">
              {sheet.cells.map((cell, ci) => (
                <div
                  key={cell.character}
                  className={
                    "sheet-cell " + (cell.warning ? "has-warning" : "")
                  }
                >
                  <img src={cell.image} alt={`切割结果 ${cell.character}`} />
                  <div>
                    <strong>{cell.character}</strong>
                    <small>
                      {cell.regenerated
                        ? "单字重绘"
                        : `第 ${cell.slot.index + 1} 格`}
                    </small>
                  </div>
                  {cell.warning && <p role="alert">{cell.warning}</p>}
                  <button disabled={pending} onClick={() => redraw(si, ci)}>
                    <RotateCcw size={12} />
                    {redrawing === cell.character ? "重绘中…" : "单字重绘"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {error && <p role="alert">{error}</p>}
        <label className="sheet-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={pending || warnings}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          我已核对，字符和笔画完整，使用这些样字
        </label>
        <button
          className="primary wide"
          disabled={pending || !confirmed || warnings}
          onClick={onApply}
        >
          <Check size={16} />
          {busy
            ? "正在平滑矢量化…"
            : expansion
              ? "确认并合入字库"
              : "转为矢量并生成测试字体"}
        </button>
      </section>
    </div>
  );
}
