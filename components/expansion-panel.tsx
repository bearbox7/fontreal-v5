"use client";
import { useRef, useState } from "react";
import { Check, ChevronRight, Pause, Sparkles } from "lucide-react";
import type { GlyphEdits, StyleConfig } from "@/lib/font/types";
import { applySheets } from "@/lib/font/sheet";
import {
  batchChunks,
  batchMissing,
  planExpansion,
  preparedCharacters,
  runExpansionBatch,
  uniqueCharacters,
  type Charset,
  type ExpansionState,
  type ExpansionBatch,
} from "@/lib/font/expansion";
import { generateExpansionImage } from "@/lib/font/expansion-images";
import SheetReview from "./sheet-review";

type Props = {
  value: ExpansionState;
  onChange: (value: ExpansionState) => void;
  onCheckpoint: (value: ExpansionState, edits?: GlyphEdits) => Promise<void>;
  edits: GlyphEdits;
  charset: Charset;
  style: StyleConfig;
  reference: string;
  provider: string;
  configured: boolean;
  busy: string;
  setBusy: (value: string) => void;
  setProgress: (value: number) => void;
  onInspect: (characters: string[]) => void;
  onPackage: () => void;
};
export default function ExpansionPanel(p: Props) {
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const value = p.value;
  const pending = value.pending;
  const plan = planExpansion(value, p.charset, p.edits);
  const prepared = preparedCharacters(p.edits, p.charset.all);
  const aiCount = prepared.filter(
    (c) => p.edits[c]?.model && p.edits[c]?.path,
  ).length;
  const total = uniqueCharacters(p.charset.all).length;
  const completed = pending
    ? pending.characters.length - batchMissing(pending).length
    : 0;
  const change = (patch: Partial<ExpansionState>) =>
    p.onChange({ ...value, ...patch });

  async function run(existing?: ExpansionBatch) {
    if (p.busy) return;
    if (!existing && (!plan.characters.length || plan.unsupported.length))
      return;
    if (!p.reference && !existing) {
      setError("请先添加参考图，沿用测试字的字体风格。");
      return;
    }
    if (!p.configured) {
      setError("所选 AI 服务尚未配置，请先检查 AI 服务设置。");
      return;
    }
    let batch: ExpansionBatch = existing || {
      id: crypto.randomUUID(),
      characters: plan.characters,
      mode: value.mode,
      capacity: value.capacity,
      provider: value.mode === "sheet" ? "openai" : p.provider,
      style: { ...p.style },
      reference: p.reference,
      createdAt: new Date().toISOString(),
      sheets: [],
    };
    if (batch.provider !== p.provider) {
      setError("请切回本批使用的 AI 服务后继续。");
      return;
    }
    stop.current = false;
    setStopping(false);
    setError("");
    setRunning(true);
    p.setBusy("保存扩字批次");
    p.setProgress(0);
    try {
      batch = await runExpansionBatch(batch, {
        generate: generateExpansionImage,
        checkpoint: async (next) => {
          batch = next;
          await p.onCheckpoint({ ...value, pending: next });
        },
        shouldPause: () => stop.current,
        onProgress: (done, total) => {
          p.setBusy(`扩字生成 ${done}/${total} 字`);
          p.setProgress(Math.round((done / total) * 100));
        },
      });
      if (!batchMissing(batch).length) setReview(true);
    } catch (e) {
      // Keep successful results available even if browser storage or the next request fails.
      p.onChange({ ...value, pending: batch });
      setError(
        `${(e as Error).message} 已返回的图片保留在本批，继续时只请求缺少的字。`,
      );
    } finally {
      p.setBusy("");
      setRunning(false);
      setStopping(false);
    }
  }

  async function accept() {
    if (!pending || p.busy) return;
    let edits = { ...p.edits };
    p.setBusy("合入扩字结果");
    setError("");
    try {
      const sheets = pending.sheets
        .map((s) => ({
          ...s,
          cells: s.cells.filter((c) => !edits[c.character]),
        }))
        .filter((s) => s.cells.length);
      edits = await applySheets(
        sheets,
        pending.style,
        edits,
        (done, total, c) => {
          p.setBusy(`平滑矢量化「${c}」 ${done}/${total}`);
          p.setProgress(Math.round((done / total) * 100));
        },
        (next) => {
          edits = next;
        },
      );
      const missing = batchMissing(pending);
      const next: ExpansionState = missing.length
        ? {
            ...value,
            pending: { ...pending, characters: missing, sheets: [] },
            history: [
              ...value.history,
              {
                id: pending.id,
                characters: pending.characters.filter(
                  (c) => !missing.includes(c),
                ),
                mode: pending.mode,
                capacity: pending.capacity,
                acceptedAt: new Date().toISOString(),
              },
            ].slice(-30),
          }
        : {
            ...value,
            pending: null,
            history: [
              ...value.history,
              {
                id: pending.id,
                characters: pending.characters,
                mode: pending.mode,
                capacity: pending.capacity,
                acceptedAt: new Date().toISOString(),
              },
            ].slice(-30),
          };
      await p.onCheckpoint(next, edits);
      setReview(false);
    } catch (e) {
      await p.onCheckpoint(value, edits).catch(() => {});
      setError(
        `合入暂停：${(e as Error).message}。已完成的字形保留，可调整后继续。`,
      );
    } finally {
      p.setBusy("");
    }
  }

  return (
    <section className="expansion-panel" id="expand-font" aria-label="分批扩字">
      <div className="expansion-heading">
        <div>
          <div className="eyebrow">GROW YOUR FONT</div>
          <h2>测试满意了，逐批补齐字库。</h2>
          <p>选择下一批的数量，生成、核对、调整，再继续。已有字形自动跳过。</p>
        </div>
        <button disabled={!!p.busy || !prepared.length} onClick={p.onPackage}>
          打包已完成的 {prepared.length} 字
        </button>
      </div>
      <div className="expansion-stats">
        <div>
          <strong>
            {prepared.length}
            <small> / {total || "—"}</small>
          </strong>
          <span>
            已定制 {total ? ((prepared.length / total) * 100).toFixed(1) : 0}%
          </span>
        </div>
        <div>
          <strong>{aiCount}</strong>
          <span>AI 字形已合入</span>
        </div>
        <div>
          <strong>{Math.max(0, total - prepared.length)}</strong>
          <span>待扩展 · 当前为基础字形</span>
        </div>
        <progress
          aria-label="字库定制完成比例"
          max={total || 1}
          value={prepared.length}
        />
      </div>
      {pending ? (
        <div className="expansion-pending">
          <div className="expansion-step">
            <span className="step-number">02</span>
            <div>
              <h3>
                本批 {pending.characters.length} 字 · 已返回 {completed} 字
              </h3>
              <p>
                {pending.mode === "sheet"
                  ? `4K 大图 · 每张最多 ${pending.capacity} 字`
                  : pending.provider === "openai"
                    ? "逐字 1K · 1024×1024 · low"
                    : "逐字生成 · 尺寸以服务返回为准"}{" "}
                · 沿用本批开始时的参考图与风格
              </p>
            </div>
          </div>
          <div className="expansion-characters" aria-label="本批字符">
            {pending.characters.map((c) => (
              <span
                key={c}
                className={!batchMissing(pending).includes(c) ? "returned" : ""}
              >
                {c}
              </span>
            ))}
          </div>
          <p className="expansion-hint">
            每张图片返回后自动保存到当前浏览器。暂停会等待当前请求结束；核对合入后不会自动开始下一批。
          </p>
          <div className="expansion-actions">
            {running ? (
              <button
                disabled={stopping}
                onClick={() => {
                  stop.current = true;
                  setStopping(true);
                }}
              >
                <Pause size={15} />
                {stopping ? "当前请求完成后暂停…" : "本张完成后暂停"}
              </button>
            ) : (
              <>
                {!!batchMissing(pending).length && (
                  <button
                    className="primary"
                    disabled={!!p.busy}
                    onClick={() => run(pending)}
                  >
                    <Sparkles size={15} />
                    继续剩余 {batchMissing(pending).length} 字 ·{" "}
                    {batchChunks(pending).length} 次请求
                  </button>
                )}
                {!!pending.sheets.length && (
                  <button disabled={!!p.busy} onClick={() => setReview(true)}>
                    核对已返回的 {completed} 字 <ChevronRight size={14} />
                  </button>
                )}
                {!pending.sheets.length && (
                  <button
                    disabled={!!p.busy}
                    onClick={async () => {
                      setError("");
                      try {
                        await p.onCheckpoint({ ...value, pending: null });
                      } catch {
                        setError("结束批次保存失败，请先保存项目。");
                      }
                    }}
                  >
                    取消本批计划
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="expansion-plan">
          <fieldset disabled={!!p.busy}>
            <legend>01 规划下一批</legend>
            <div className="expansion-controls">
              <label>
                扩字范围
                <select
                  aria-label="扩字范围"
                  value={value.scope}
                  onChange={(e) =>
                    change({ scope: e.target.value as ExpansionState["scope"] })
                  }
                >
                  <option value="chinese">常用汉字 · 常见字优先</option>
                  <option value="latin">英文 / 数字</option>
                  <option value="punctuation">中英标点</option>
                  <option value="custom">自填所需文字</option>
                </select>
              </label>
              <label>
                本批新增字数
                <input
                  aria-label="本批新增字数"
                  type="number"
                  min={1}
                  max={288}
                  value={value.quantity}
                  onChange={(e) =>
                    change({
                      quantity: Math.max(
                        1,
                        Math.min(288, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
              <label>
                生成配比
                <select
                  aria-label="扩字生成配比"
                  value={
                    value.mode === "single" ? "single" : String(value.capacity)
                  }
                  onChange={(e) =>
                    change(
                      e.target.value === "single"
                        ? { mode: "single" }
                        : {
                            mode: "sheet",
                            capacity: Number(e.target.value) as 32 | 72,
                          },
                    )
                  }
                >
                  <option value="32" disabled={p.provider !== "openai"}>
                    4K / 32 字 · 480×540 每格
                  </option>
                  <option value="72" disabled={p.provider !== "openai"}>
                    4K / 72 字 · 320×360 每格
                  </option>
                  <option value="single">
                    {p.provider === "openai"
                      ? "1K / 1 字 · 1024×1024 · low"
                      : "逐字生成"}
                  </option>
                </select>
              </label>
            </div>
            <div className="expansion-quantities">
              {[32, 72, 144, 288].map((n) => (
                <button
                  key={n}
                  className={value.quantity === n ? "selected" : ""}
                  onClick={() => change({ quantity: n })}
                >
                  {n} 字
                </button>
              ))}
              <small>每批 1–288 字，可自由修改</small>
            </div>
            {value.scope === "custom" && (
              <label className="expansion-custom">
                粘贴下一批需要的文字
                <textarea
                  aria-label="自填扩字文字"
                  value={value.customText}
                  maxLength={8000}
                  onChange={(e) => change({ customText: e.target.value })}
                  placeholder="如品牌文案、菜单或文章；自动去重并跳过已完成的字"
                />
              </label>
            )}
          </fieldset>
          <div className="expansion-estimate">
            <strong>
              本批新增 {plan.characters.length} 字 → {plan.requests}{" "}
              {value.mode === "sheet" ? "张 4K 图" : "张单字图"} /{" "}
              {plan.requests} 次请求
            </strong>
            <span>
              已跳过 {plan.skipped.length} 个已有字形 · 此范围还剩{" "}
              {plan.remaining.length} 字
            </span>
            <p>
              {value.mode === "sheet"
                ? `不足 ${value.capacity} 字仍使用一张完整 4K 图。`
                : "每字单独请求一张图片。"}
              问题字可在核对时单独重绘，另产生一次请求。价格以平台实际计费为准。
            </p>
          </div>
          {!!plan.unsupported.length && (
            <p className="warning" role="alert">
              以下字不在当前基础字库中，请移除后再生成：
              {plan.unsupported.join("")}
            </p>
          )}
          <details className="expansion-list" open>
            <summary>查看本批待生成字符（{plan.characters.length}）</summary>
            <div className="expansion-characters" aria-label="下一批待生成字符">
              {plan.characters.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            {!plan.characters.length && (
              <p>此范围没有待生成字符，可更换范围或自填文字。</p>
            )}
          </details>
          <div className="expansion-actions">
            <button
              className="primary"
              disabled={
                !!p.busy ||
                !plan.characters.length ||
                !!plan.unsupported.length ||
                (value.mode === "sheet" && p.provider !== "openai")
              }
              onClick={() => run()}
            >
              <Sparkles size={16} />
              只生成这批 {plan.characters.length} 字
            </button>
            <small>生成后先核对，再合入；你决定何时开始下一批。</small>
          </div>
          {p.provider !== "openai" && value.mode === "sheet" && (
            <p className="warning">
              4K 批量需选择 GPT Image · 302.AI，或切换逐字生成。
            </p>
          )}
        </div>
      )}
      {!!error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      {!!value.history.length && (
        <div className="expansion-history">
          <h3>
            <Check size={16} />
            已合入批次
          </h3>
          {value.history
            .slice(-5)
            .reverse()
            .map((batch, i) => (
              <div key={`${batch.id}-${i}`}>
                <span>
                  {batch.characters.length} 字 ·{" "}
                  {batch.mode === "sheet"
                    ? `4K / ${batch.capacity} 字`
                    : "逐字"}
                  <small>
                    {batch.characters.slice(0, 16).join("")}
                    {batch.characters.length > 16 ? "…" : ""}
                  </small>
                </span>
                <button
                  disabled={!!p.busy}
                  onClick={() => p.onInspect(batch.characters)}
                >
                  逐字调整 <ChevronRight size={13} />
                </button>
              </div>
            ))}
        </div>
      )}
      <div className="expansion-footer">
        <span className="step-number">03</span>
        <p>
          核对合入后，在字符工坊调整问题字，再回到这里继续。随时可打包已完成的字；“补齐基础字库”会保留已有字形，其余使用基础字体。
        </p>
      </div>
      {review && pending && (
        <SheetReview
          expansion
          provider={pending.provider}
          sheets={pending.sheets}
          reference={pending.reference}
          style={pending.style}
          busy={!!p.busy}
          onClose={() => setReview(false)}
          onApply={accept}
          onChange={(sheets) => {
            const next = { ...value, pending: { ...pending, sheets } };
            p.onChange(next);
            p.onCheckpoint(next).catch(() =>
              setError("图片结果尚未保存，请点击保存项目后再离开。"),
            );
          }}
        />
      )}
    </section>
  );
}
