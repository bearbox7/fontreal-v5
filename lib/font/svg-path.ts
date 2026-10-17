import svgpath from "svgpath";
import type { Path } from "opentype.js";
// Expand implicit coordinate groups before constructing font commands.
// OpenType.js fromSVG drops extra pairs in commands such as L x y x y.
function segments(data: string) {
  const parsed = svgpath(data).unshort().unarc().abs() as ReturnType<
    typeof svgpath
  > & { err: string; segments: [string, ...number[]][] };
  if (parsed.err) throw Error("字形矢量路径无效");
  return parsed.segments;
}
export function pathNodeCount(data: string) {
  return segments(data).filter((s) => s[0].toUpperCase() !== "Z").length;
}
export function writeGlyphPath(path: Path, precision = 3): string {
  const value = (n: number) => {
    if (!Number.isFinite(n)) throw Error("字形包含无效坐标");
    return String(Math.round(n * 10 ** precision) / 10 ** precision);
  };
  return path.commands
    .map((c) => {
      if (c.type === "M" || c.type === "L")
        return `${c.type}${value(c.x)} ${value(c.y)}`;
      if (c.type === "C")
        return `C${[c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(value).join(" ")}`;
      if (c.type === "Q")
        return `Q${[c.x1, c.y1, c.x, c.y].map(value).join(" ")}`;
      return "Z";
    })
    .join("");
}
export function readGlyphPath(
  data: string,
  Constructor: { new (): Path },
): Path {
  const path = new Constructor();
  let x = 0,
    y = 0,
    startX = 0,
    startY = 0,
    open = false;
  for (const segment of segments(data)) {
    const [raw, ...p] = segment,
      type = raw.toUpperCase();
    if (type === "M") {
      if (open) path.close();
      path.moveTo(p[0], p[1]);
      x = startX = p[0];
      y = startY = p[1];
      open = true;
    } else if (type === "L") {
      path.lineTo(p[0], p[1]);
      x = p[0];
      y = p[1];
    } else if (type === "H") {
      path.lineTo(p[0], y);
      x = p[0];
    } else if (type === "V") {
      path.lineTo(x, p[0]);
      y = p[0];
    } else if (type === "C") {
      path.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
      x = p[4];
      y = p[5];
    } else if (type === "Q") {
      path.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      x = p[2];
      y = p[3];
    } else if (type === "Z") {
      path.close();
      x = startX;
      y = startY;
      open = false;
    } else throw Error("字形包含不支持的路径指令");
  }
  if (open) path.close();
  return path;
}
