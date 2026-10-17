import { z } from "zod";

export const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const finite = z.number().finite();
const text = (max: number) => z.string().max(max);
const image = text(40_000_000).refine(
  (s) => !s || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
  "图片数据格式无效",
);
const character = z
  .string()
  .refine((s) => Array.from(s).length === 1 && !!s.trim(), "字符无效");
const style = z.object({
  base: z.enum(["sans", "serif"]),
  weight: finite.min(300).max(800),
  width: finite.min(70).max(130),
  roundness: finite.min(0).max(100),
  slant: finite.min(-15).max(15),
  tracking: finite.min(-5).max(20),
});
const slot = z.object({
  character,
  index: z.number().int().min(0).max(287),
  x: finite.min(0).max(1),
  y: finite.min(0).max(1),
  width: finite.positive().max(1),
  height: finite.positive().max(1),
});
const generated = {
  model: text(200),
  prompt: text(100_000),
  createdAt: text(100),
};
const glyph = z.object({
  scale: finite.min(1).max(1000),
  rotate: finite.min(-360).max(360),
  x: finite.min(-5000).max(5000),
  y: finite.min(-5000).max(5000),
  version: z.number().int().min(0).max(1_000_000),
  manuallyEdited: z.boolean().optional(),
  path: text(3_000_000).optional(),
  sourceImage: image.optional(),
  model: generated.model.optional(),
  prompt: generated.prompt.optional(),
  createdAt: generated.createdAt.optional(),
  generatedStyle: style.optional(),
  redrawComments: z.array(z.object({x: z.number().min(0).max(1), y: z.number().min(0).max(1), text: z.string().trim().min(1).max(500)})).max(8).optional(),
  redrawPrompt: text(2000).optional(),
  redrawReference: image.optional(),
  pendingGeneration: z.object({ image, ...generated, style }).optional(),
  sheetSlot: slot.optional(),
  traceStats: z
    .object({
      nodes: z.number().int().nonnegative(),
      fidelity: finite.min(0).max(1),
      tolerance: finite.nonnegative(),
    })
    .optional(),
});
const sheet = z.object({
  image,
  ...generated,
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  layout: z
    .object({
      columns: z.number().int().positive().max(72),
      rows: z.number().int().positive().max(72),
      capacity: z.number().int().positive().max(72),
    })
    .optional(),
  cells: z
    .array(
      z.object({
        character,
        image,
        warning: text(1000),
        slot,
        regenerated: z.object(generated).optional(),
      }),
    )
    .min(1)
    .max(72),
});
const provider = z.enum(["openai", "gemini"]);
const capacity = z.union([z.literal(32), z.literal(72)]);
const batch = z.object({
  id: text(128),
  characters: z.array(character).min(1).max(288),
  mode: z.enum(["sheet", "single"]),
  capacity,
  provider,
  style,
  reference: image,
  createdAt: text(100),
  sheets: z.array(sheet).max(288),
});
const expansion = z.object({
  scope: z.enum(["chinese", "latin", "punctuation", "custom"]),
  quantity: z.number().int().min(1).max(288),
  customText: text(8000),
  mode: z.enum(["sheet", "single"]),
  capacity,
  pending: batch.nullable(),
  history: z
    .array(
      z.object({
        id: text(128),
        characters: z.array(character).max(288),
        mode: z.enum(["sheet", "single"]),
        capacity,
        acceptedAt: text(100),
      }),
    )
    .max(30),
});
const project = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  style,
  edits: z.record(
    z.string().refine((s) => Array.from(s).length === 1),
    glyph,
  ),
  reference: image.default(""),
  prompt: text(100_000).default(""),
  analysis: z
    .object({
      description: text(100_000),
      category: text(500),
      tags: z.array(text(500)).max(1000),
      characters: z
        .array(
          z.object({
            character: z.string().max(8),
            x: finite,
            y: finite,
            width: finite,
            height: finite,
          }),
        )
        .max(1000),
      style,
    })
    .nullable()
    .default(null),
  testText: text(1000),
  provider: provider.default("openai"),
  batchMode: z.boolean().default(true),
  sheets: z.array(sheet).max(288).default([]),
  sheetStamp: text(45_000_000).default(""),
  sheetCapacity: capacity.default(72),
  expansion: expansion.optional(),
  updatedAt: finite,
  preview: z
    .object({
      sample: text(100_000),
      size: finite.min(1).max(1000),
      space: finite.min(-100).max(100),
      line: finite.min(0.1).max(10),
      dark: z.boolean(),
      inkColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      paperColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});
const envelope = z.object({
  format: z.literal("zifang-project"),
  version: z.literal(1),
  exportedAt: text(100),
  project,
});
export type PortableProject = z.infer<typeof project>;
export function serializeProject(data: unknown) {
  const parsed = project.safeParse(data);
  if (!parsed.success)
    throw Error(
      "当前项目含有无效数据，无法导出。请检查字形或重新打开保存的项目。",
    );
  const result = JSON.stringify({
    format: "zifang-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    project: parsed.data,
  });
  if (new Blob([result]).size > MAX_PROJECT_BYTES)
    throw Error("项目超过 256 MB，请先完成并合入当前批次后再导出。");
  return result;
}
export function parseProjectFile(
  source: string,
  newId: string,
): PortableProject {
  if (new Blob([source]).size > MAX_PROJECT_BYTES)
    throw Error("请选择 256 MB 内的项目 JSON 文件。");
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw Error("文件不是有效的 JSON，请选择字坊导出的项目文件。");
  }
  const parsed = envelope.safeParse(data);
  let original: PortableProject;
  if (parsed.success) original = parsed.data.project;
  else {
    const legacy =
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      !("format" in data) &&
      !("project" in data)
        ? z
            .object({
              name: project.shape.name,
              style,
              edits: project.shape.edits,
              analysis: project.shape.analysis,
            })
            .safeParse(data)
        : null;
    if (!legacy?.success)
      throw Error(
        "项目文件格式或版本不受支持，请选择字坊导出的完整项目 JSON。",
      );
    const value = legacy.data;
    original = project.parse({
      ...value,
      id: newId,
      reference: "",
      prompt: "",
      testText: Object.keys(value.edits)
        .filter((c) => c.trim())
        .slice(0, 72)
        .join(""),
      provider: Object.values(value.edits).some((e) =>
        e.model?.startsWith("gemini"),
      )
        ? "gemini"
        : "openai",
      batchMode: true,
      sheets: [],
      sheetStamp: "",
      sheetCapacity: Object.keys(value.edits).length <= 32 ? 32 : 72,
      updatedAt: Date.now(),
    });
  }
  const result = { ...original, id: newId, updatedAt: Date.now() };
  // A copied project has a new ID. Preserve test-sheet approval only if its saved inputs still match.
  const signature = {
    style: result.style,
    reference: result.reference,
    testText: result.testText,
    provider: result.provider,
    batchMode: result.batchMode,
    sheetCapacity: result.sheetCapacity,
    id: result.id,
  };
  try {
    const previous = JSON.parse(original.sheetStamp);
    const matches =
      [
        "reference",
        "testText",
        "provider",
        "batchMode",
        "sheetCapacity",
        "id",
      ].every(
        (key) => previous[key] === original[key as keyof PortableProject],
      ) &&
      Object.entries(original.style).every(
        ([key, value]) => previous.style?.[key] === value,
      );
    result.sheetStamp = matches ? JSON.stringify(signature) : "";
  } catch {
    result.sheetStamp = "";
  }
  return result;
}
export function projectFilename(name: string) {
  return `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 80) || "Zifang"}.zifang.json`;
}
