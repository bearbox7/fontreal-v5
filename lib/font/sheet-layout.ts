export const SHEET = {
  width: 3840,
  height: 2160,
  columns: 12,
  rows: 6,
  capacity: 72,
} as const;
export type SheetCapacity = 32 | 72;
export function sheetLayout(capacity: SheetCapacity = 72) {
  return capacity === 32
    ? { width: 3840, height: 2160, columns: 8, rows: 4, capacity: 32 }
    : { ...SHEET };
}
export const DEFAULT_TEST_TEXT = [
  "字有新生风格自成山川日月",
  "天地人和春夏秋冬东西南北",
  "大明厨房城市乡村江河湖海",
  "花草树木云雨雪光星空水火",
  "家国平安幸福快乐温暖美好",
  "衣食住行金石书画诗茶酒香",
].join("\n");
export function testCharacters(text: string) {
  return [...new Set(Array.from(text))].filter((c) => c.trim());
}
export function limitTestText(text: string, capacity: SheetCapacity = 72) {
  let count = 0,
    result = "";
  for (const c of text) {
    if (c.trim() && ++count > capacity) break;
    result += c;
  }
  return result;
}
export function previewRows(text: string, capacity: SheetCapacity = 72) {
  const characters = Array.from(text).filter((c) => c.trim());
  const columns = characters.length > 16 ? sheetLayout(capacity).columns : 4;
  return Array.from(
    { length: Math.ceil(characters.length / columns) },
    (_, i) => characters.slice(i * columns, (i + 1) * columns),
  );
}
export function sheetSlots(characters: string[], layout = sheetLayout()) {
  if (characters.length > layout.capacity)
    throw Error(`每张大图最多容纳 ${layout.capacity} 个字`);
  return characters.map((character, index) => ({
    character,
    index,
    x: (index % layout.columns) / layout.columns,
    y: Math.floor(index / layout.columns) / layout.rows,
    width: 1 / layout.columns,
    height: 1 / layout.rows,
  }));
}
export type SheetSlot = ReturnType<typeof sheetSlots>[number];
