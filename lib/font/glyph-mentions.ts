export type GlyphReference = {character: string; code: string};
export function glyphCode(character: string) {
  return `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4,"0")}`;
}
export function resolveGlyphMentions(texts: string[], available: string) {
  const allowed = new Set(Array.from(available));
  const references: GlyphReference[] = [], errors: string[] = [];
  const seen = new Set<string>();
  const pattern = /@(?:U\+([0-9A-Za-z]{1,8})|([^\s@，。；：、！？“”"'（）()\[\]]))(?:\(U\+([0-9A-Za-z]{1,8})\))?/giu;
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      let character = match[2] || "";
      if (match[1]) {
        const value = /^[0-9a-f]{4,6}$/i.test(match[1]) ? parseInt(match[1],16) : -1;
        character = value >= 0 && value <= 0x10ffff && !(value>=0xd800 && value<=0xdfff) ? String.fromCodePoint(value) : "";
      }
      if (!character || !allowed.has(character) || (match[3] && `U+${match[3].toUpperCase()}` !== glyphCode(character))) {
        errors.push(`无法在当前字库定位 ${match[0]}，请选择候选字形或检查编号`); continue;
      }
      const code = glyphCode(character);
      if (!seen.has(code)) {seen.add(code);references.push({character,code});}
    }
  }
  if (references.length>4) errors.push("一次重绘最多引用 4 个不同字形，请减少引用");
  return {references,errors:[...new Set(errors)]};
}
export function glyphReferenceInstructions(references: GlyphReference[], imageNumber: number) {
  if (!references.length) return "";
  return `\nCROSS-GLYPH REFERENCES: Image ${imageNumber} is a reference sheet of actual glyph outlines from the SAME current font project. Each cell has a Unicode ID label. Resolve every @ mention in the user instructions or location comments by this stable ID: ${references.map((r,i)=>`cell ${i+1} ${r.code} = “${r.character}” (@${r.character})`).join("; ")}. Use only the requested traits (stroke weight, terminals, shared components, proportions) to harmonize the target glyph with these references. Preserve the target character; do not replace it with a referenced character. Do not output sheet labels, reference glyphs or a grid.`;
}
