import { generateTestSheets, type GlyphSheet } from "./sheet";
import type { ExpansionBatch } from "./expansion";

// One paid request at a time. The caller saves each result before requesting the next.
export async function generateExpansionImage(
  batch: ExpansionBatch,
  characters: string[],
): Promise<GlyphSheet> {
  if (batch.mode === "sheet") {
    const [sheet] = await generateTestSheets(
      characters.join(""),
      batch.reference,
      batch.style,
      () => {},
      batch.capacity,
    );
    return sheet;
  }
  const character = characters[0];
  const response = await fetch("/api/glyph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: batch.provider,
      character,
      style: batch.style,
      image: batch.reference,
      variation: 1,
    }),
  });
  const data = (await response.json()) as any;
  if (!response.ok) throw Error(data.error || "单字生成失败");
  const image = new Image();
  image.src = data.image;
  await image.decode();
  if (
    batch.provider === "openai" &&
    (image.width !== 1024 || image.height !== 1024)
  )
    throw Error(
      `单字接口返回 ${image.width}×${image.height}，未达到请求的 1024×1024。`,
    );
  return {
    image: data.image,
    model: data.model,
    prompt: data.prompt,
    createdAt: data.createdAt,
    width: image.width,
    height: image.height,
    layout: { columns: 1, rows: 1, capacity: 1 },
    cells: [
      {
        character,
        image: data.image,
        warning: "",
        slot: { character, index: 0, x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  };
}
