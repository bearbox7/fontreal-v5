// OpenType legacy horizontal kerning table, serialized into both export formats.
export function addKerning(
  buffer: ArrayBuffer,
  pairs: Record<string, number>,
): ArrayBuffer {
  const sorted = Object.entries(pairs)
    .map(([k, v]) => ({ indices: k.split(",").map(Number), value: v }))
    .sort((a, b) => a.indices[0] - b.indices[0] || a.indices[1] - b.indices[1]);
  if (!sorted.length) return buffer;
  const kern = new Uint8Array(18 + 6 * sorted.length),
    kv = new DataView(kern.buffer);
  kv.setUint16(2, 1);
  kv.setUint16(6, kern.length - 4);
  kv.setUint16(8, 1);
  kv.setUint16(10, sorted.length);
  const pow = 2 ** Math.floor(Math.log2(sorted.length));
  kv.setUint16(12, pow * 6);
  kv.setUint16(14, Math.log2(pow));
  kv.setUint16(16, sorted.length * 6 - pow * 6);
  sorted.forEach((p, i) => {
    kv.setUint16(18 + i * 6, p.indices[0]);
    kv.setUint16(20 + i * 6, p.indices[1]);
    kv.setInt16(22 + i * 6, p.value);
  });
  const source = new Uint8Array(buffer),
    dv = new DataView(buffer),
    tables: { tag: string; data: Uint8Array }[] = [];
  for (let i = 0; i < dv.getUint16(4); i++) {
    const at = 12 + i * 16,
      tag = String.fromCharCode(...source.slice(at, at + 4)),
      offset = dv.getUint32(at + 8),
      length = dv.getUint32(at + 12);
    if (tag !== "kern") {
      const data = source.slice(offset, offset + length);
      if (tag === "head") new DataView(data.buffer).setUint32(8, 0);
      tables.push({ tag, data });
    }
  }
  tables.push({ tag: "kern", data: kern });
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const align = (n: number) => (n + 3) & ~3;
  const total =
      12 +
      tables.length * 16 +
      tables.reduce((n, t) => n + align(t.data.length), 0),
    out = new Uint8Array(total),
    v = new DataView(out.buffer);
  out.set(source.slice(0, 4));
  v.setUint16(4, tables.length);
  const tp = 2 ** Math.floor(Math.log2(tables.length));
  v.setUint16(6, tp * 16);
  v.setUint16(8, Math.log2(tp));
  v.setUint16(10, tables.length * 16 - tp * 16);
  function checksum(data: Uint8Array) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum =
        (sum +
          ((data[i] || 0) * 16777216 +
            (data[i + 1] || 0) * 65536 +
            (data[i + 2] || 0) * 256 +
            (data[i + 3] || 0))) >>>
        0;
    return sum;
  }
  let offset = 12 + tables.length * 16,
    head = 0;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    out.set(
      Array.from(t.tag).map((c) => c.charCodeAt(0)),
      at,
    );
    v.setUint32(at + 4, checksum(t.data));
    v.setUint32(at + 8, offset);
    v.setUint32(at + 12, t.data.length);
    out.set(t.data, offset);
    if (t.tag === "head") head = offset;
    offset += align(t.data.length);
  });
  v.setUint32(head + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out.buffer;
}
