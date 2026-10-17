import type { GlyphEdits, StyleConfig } from "./types";
import type { GlyphSheet } from "./sheet";
import type { SheetCapacity } from "./sheet-layout";

export const COMMON_FIRST =
  "的一是不了在人有我他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从使知情外民新样";
export type Charset = {
  all: string;
  chinese: string;
  latin: string;
  punctuation: string;
};
export type ExpansionScope = "chinese" | "latin" | "punctuation" | "custom";
export type ExpansionBatch = {
  id: string;
  characters: string[];
  mode: "sheet" | "single";
  capacity: SheetCapacity;
  provider: string;
  style: StyleConfig;
  reference: string;
  createdAt: string;
  sheets: GlyphSheet[];
};
export type ExpansionRecord = {
  id: string;
  characters: string[];
  mode: "sheet" | "single";
  capacity: SheetCapacity;
  acceptedAt: string;
};
export type ExpansionState = {
  scope: ExpansionScope;
  quantity: number;
  customText: string;
  mode: "sheet" | "single";
  capacity: SheetCapacity;
  pending: ExpansionBatch | null;
  history: ExpansionRecord[];
};
export function defaultExpansion(): ExpansionState {
  return {
    scope: "chinese",
    quantity: 32,
    customText: "",
    mode: "sheet",
    capacity: 32,
    pending: null,
    history: [],
  };
}
export function uniqueCharacters(text: string) {
  return [...new Set(Array.from(text))].filter((c) => !!c.trim());
}
export function preparedCharacters(edits: GlyphEdits, allowed: string) {
  return Object.keys(edits).filter(
    (c) =>
      c.trim() &&
      allowed.includes(c) &&
      (!!edits[c].path || edits[c].version > 0),
  );
}
export function planExpansion(
  state: ExpansionState,
  charset: Charset,
  edits: GlyphEdits,
) {
  const source =
    state.scope === "custom"
      ? state.customText
      : state.scope === "chinese"
        ? COMMON_FIRST + charset.chinese
        : charset[state.scope];
  const requested = uniqueCharacters(source);
  const supported = requested.filter((c) => charset.all.includes(c));
  const skipped = supported.filter((c) => !!edits[c]);
  const remaining = supported.filter((c) => !edits[c]);
  const quantity = Math.max(1, Math.min(288, Math.floor(state.quantity) || 32));
  const characters = remaining.slice(0, quantity);
  return {
    characters,
    skipped,
    remaining,
    unsupported:
      state.scope === "custom"
        ? requested.filter((c) => !charset.all.includes(c))
        : [],
    requests: Math.ceil(
      characters.length / (state.mode === "sheet" ? state.capacity : 1),
    ),
  };
}
export function batchMissing(batch: ExpansionBatch) {
  const done = new Set(
    batch.sheets.flatMap((s) => s.cells.map((c) => c.character)),
  );
  return batch.characters.filter((c) => !done.has(c));
}
export function batchChunks(batch: ExpansionBatch) {
  const missing = batchMissing(batch);
  const size = batch.mode === "sheet" ? batch.capacity : 1;
  return Array.from({ length: Math.ceil(missing.length / size) }, (_, i) =>
    missing.slice(i * size, (i + 1) * size),
  );
}
export async function runExpansionBatch(
  batch: ExpansionBatch,
  options: {
    generate: (
      batch: ExpansionBatch,
      characters: string[],
    ) => Promise<GlyphSheet>;
    checkpoint: (batch: ExpansionBatch) => Promise<void>;
    shouldPause: () => boolean;
    onProgress: (done: number, total: number) => void;
  },
) {
  let current = batch;
  await options.checkpoint(current);
  for (const characters of batchChunks(current)) {
    if (options.shouldPause()) break;
    options.onProgress(
      current.characters.length - batchMissing(current).length,
      current.characters.length,
    );
    const sheet = await options.generate(current, characters);
    current = { ...current, sheets: [...current.sheets, sheet] };
    await options.checkpoint(current);
  }
  options.onProgress(
    current.characters.length - batchMissing(current).length,
    current.characters.length,
  );
  return current;
}
