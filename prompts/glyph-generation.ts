import type { StyleConfig } from "@/lib/font/types";
export function glyphPrompt(
  character: string,
  style: StyleConfig,
  variation = 0,
  instructions = "",
  referenceNote = "",
) {
  return `Create exactly ONE Chinese or Latin glyph: “${character}” (U+${character.codePointAt(0)!.toString(16)}). Preserve its correct, complete stroke structure. Match the lettering style of the attached reference if present. Font style: ${JSON.stringify(style)}. Variation index: ${variation}. Center the single black glyph on a pure white square canvas with generous empty margins. Flat solid ink, no shadow, no gradient, no decorative objects, no caption, no extra characters. Aim for consistent weight, Chinese ideographic em square proportions, baseline and terminals. This is a single glyph for vector tracing into a font. ${referenceNote}${instructions.trim() ? `\nUser correction instructions for this glyph (preserve the target character and output only that glyph): ${instructions.trim()}` : ""}`;
}

/**
 * Qwen-Image multi-reference typography direction.
 * Image 1 supplies the lettering aesthetic; image 2, when present, is a
 * neutral structural template only (never a substitute type style).
 */
export function bailianReferencePrompt(
  character: string,
  style: StyleConfig,
  hasStyleReference: boolean,
  hasStructureReference: boolean,
) {
  return `你是一位严谨的专业中文字库设计师。本次任务是将指定汉字「${character}」重新绘制成与设计师参考图高度统一的字体字形，不是设计一款新的随意字体。
参考图角色与优先级：
${hasStyleReference ? "【图1：风格母版，最高优先级】仔细临摹图中字体的笔画粗细与粗细对比、横竖比例、转角与折笔、起笔收笔、点撇捺造型、曲线节奏、重心、倾斜、宽高比、部件疏密、内部留白和外轮廓特征。保留参考图中独特的设计语言，不要套用通用黑体/宋体，更不要随意圆角、加粗、变形或添加新的装饰。" : "没有上传独立的风格母版，优先依据明确给出的风格参数与已绘字形。"}
${hasStructureReference ? (hasStyleReference ? "【图2：当前汉字的标准结构骨架，仅用于确认字形】只参考它的部件组成、笔画数量、笔顺关系和正确字符身份；不要模仿图2的字体笔画、风格或粗细。以图1的笔画语言彻底重画图2所示汉字。" : "【结构参考图：仅用于确认目标字形】它不决定最终的字体风格。") : "严格遵守目标汉字的正确完整结构，不可以变成风格参考中的其他字。"}
字形一致性规则：不同汉字像同一套字库，横画和竖画的粗细关系统一，重复的部件和偏旁采用相同形态，笔锋、转折半径、端点、字面率与负空间节奏一致。对于参考图中没有出现的笔画，根据同类笔画推断，尽量减少风格漂移。
目标形态：${style.base === "serif" ? "按参考图的衬线/宋体笔锋规律处理" : "按参考图的非衬线笔锋规律处理"}；字重参数 ${style.weight}，宽度 ${style.width}%，圆角 ${style.roundness}%，倾斜 ${style.slant}°。若参数与图1的显著笔画特征冲突，优先保留图1风格；参数用于相对尺度微调。
输出规则：只画「${character}」这个字，所有必要笔画完整准确，不缺笔、不多笔、不重叠、不过度艺术化而不可辨。纯白 #FFFFFF 背景，单个纯黑 #000000 的实心字形，居中排列，保留适度四周留白，边缘清晰，适合自动矢量描摹。绝对不要输出参考图中的原有文字、标注、解释、格线、纹理、投影或其他元素。
最终检查：先检查「${character}」字符结构是否正确，再逐项比对图1的笔画端点、转角、粗细、部件比例与字面率。只返回完成的字形图像。`;
}
