// fonteditor-core writes UTF-8 strings under the Mac Roman encoding ID.
// Reuse the matching UTF-16 record so Chinese family names remain readable.
export function unicodeNames(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  let nameEntry = 0,
    nameOffset = 0,
    headOffset = 0;
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16,
      tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    if (tag === "name") {
      nameEntry = at;
      nameOffset = view.getUint32(at + 8);
    }
    if (tag === "head") headOffset = view.getUint32(at + 8);
  }
  if (!nameOffset || !headOffset) return buffer;
  const count = view.getUint16(nameOffset + 2),
    storage = nameOffset + view.getUint16(nameOffset + 4);
  const records = Array.from({ length: count }, (_, i) =>
    bytes.slice(nameOffset + 6 + i * 12, nameOffset + 18 + i * 12),
  );
  for (const record of records) {
    const r = new DataView(record.buffer);
    if (r.getUint16(0) !== 1) continue;
    const text = bytes.subarray(
      storage + r.getUint16(10),
      storage + r.getUint16(10) + r.getUint16(8),
    );
    if (!text.some((b) => b >= 128)) continue;
    const unicode = records.find((item) => {
      const v = new DataView(item.buffer);
      return v.getUint16(0) === 3 && v.getUint16(6) === r.getUint16(6);
    });
    if (!unicode) continue;
    const u = new DataView(unicode.buffer);
    r.setUint16(0, 0);
    r.setUint16(2, 4);
    r.setUint16(4, 0);
    r.setUint16(8, u.getUint16(8));
    r.setUint16(10, u.getUint16(10));
  }
  records.sort((a, b) => {
    const av = new DataView(a.buffer),
      bv = new DataView(b.buffer);
    for (const at of [0, 2, 4, 6]) {
      const n = av.getUint16(at) - bv.getUint16(at);
      if (n) return n;
    }
    return 0;
  });
  records.forEach((record, i) => bytes.set(record, nameOffset + 6 + i * 12));
  function checksum(start: number, length: number) {
    let sum = 0;
    for (let i = 0; i < length; i += 4)
      sum = (sum + view.getUint32(start + i)) >>> 0;
    return sum;
  }
  const length = view.getUint32(nameEntry + 12);
  view.setUint32(nameEntry + 4, checksum(nameOffset, (length + 3) & ~3));
  view.setUint32(headOffset + 8, 0);
  view.setUint32(
    headOffset + 8,
    (0xb1b0afba - checksum(0, bytes.length)) >>> 0,
  );
  return buffer;
}
