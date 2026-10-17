import { Potrace } from "@buzz-dee/potrace-ts";
import { pathNodeCount } from "./svg-path";
export type TraceCandidate = { d: string; nodes: number; tolerance: number };
export function traceCandidates(image: ImageData, threshold = 128) {
  const mask = new Uint8Array(image.width * image.height);
  let black = 0;
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    mask[i] =
      image.data[p] * 0.299 +
        image.data[p + 1] * 0.587 +
        image.data[p + 2] * 0.114 <
      threshold
        ? 1
        : 0;
    black += mask[i];
  }
  if (black > mask.length / 2)
    for (let i = 0; i < mask.length; i++) mask[i] = 1 - mask[i];
  // Remove only disconnected 1–2 pixel foreground specks, then validate against
  // exactly the same bitmap that is traced. Chinese radicals and dots remain.
  const visited = new Uint8Array(mask.length),
    queue = new Int32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    let head = 0,
      tail = 1;
    queue[0] = i;
    visited[i] = 1;
    while (head < tail) {
      const at = queue[head++],
        x = at % image.width;
      for (const next of [
        x > 0 ? at - 1 : -1,
        x + 1 < image.width ? at + 1 : -1,
        at - image.width,
        at + image.width,
      ]) {
        if (next >= 0 && next < mask.length && mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (tail <= 2) for (let j = 0; j < tail; j++) mask[queue[j]] = 0;
  }
  const rgba = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < mask.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = mask[i] ? 0 : 255;
    rgba[i * 4 + 3] = 255;
  }
  const tracer = new Potrace(
    { data: rgba, width: image.width, height: image.height } as ImageData,
    {
      threshold: 128,
      turdSize: 0,
      alphaMax: 1,
      optCurve: true,
      optTolerance: 0.2,
    },
  );
  const candidates: TraceCandidate[] = [];
  for (const tolerance of [0.05, 0.1, 0.2, 0.5, 1, 1.5, 2, 3, 4]) {
    tracer.setParameters({ optTolerance: tolerance });
    const d = tracer.getSVGPath();
    candidates.push({
      d,
      tolerance,
      nodes: pathNodeCount(d),
    });
  }
  if (Math.min(image.width, image.height) < 640) {
    for (const alphaMax of [0.6, 0.3, 0])
      for (const tolerance of [0.05, 0.2, 1]) {
        tracer.setParameters({ alphaMax, optTolerance: tolerance });
        const d = tracer.getSVGPath();
        candidates.push({ d, tolerance, nodes: pathNodeCount(d) });
      }
  }
  return { mask, candidates };
}
export function compareMasks(
  source: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  radius = 2,
) {
  let intersection = 0,
    union = 0,
    distant = 0,
    lostInk = 0,
    addedInk = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] || output[i]) union++;
    if (source[i] && output[i]) intersection++;
    if (source[i] === output[i]) continue;
    const target = source[i] ? output : source,
      x = i % width,
      y = Math.floor(i / width);
    let close = false;
    for (let dy = -radius; dy <= radius && !close; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (
          dx * dx + dy * dy <= radius * radius &&
          x + dx >= 0 &&
          x + dx < width &&
          y + dy >= 0 &&
          y + dy < height &&
          target[(y + dy) * width + x + dx]
        ) {
          close = true;
          break;
        }
      }
    if (!close) {
      distant++;
      if (source[i]) lostInk++;
      else addedInk++;
    }
  }
  return { iou: union ? intersection / union : 0, distant, lostInk, addedInk };
}
export function traceLimits(width: number, height: number) {
  // A pixel represents a larger share of the outline in compact contact sheets.
  return Math.min(width, height) < 640
    ? { minFidelity: 0.98, edgeRadius: 2 }
    : { minFidelity: 0.99, edgeRadius: 2 };
}
export function acceptableTrace(
  score: ReturnType<typeof compareMasks>,
  width: number,
  height: number,
) {
  return (
    score.iou >= traceLimits(width, height).minFidelity &&
    score.addedInk === 0 &&
    score.lostInk <= 2
  );
}
export async function smoothTrace(
  image: ImageData,
  threshold = 128,
  maxTolerance = 4,
) {
  const { mask, candidates } = traceCandidates(image, threshold);
  const limits = traceLimits(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  let best: (TraceCandidate & { iou: number; distant: number }) | undefined;
  for (const candidate of candidates) {
    if (candidate.tolerance > maxTolerance) continue;
    if (!candidate.d) continue;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fill(new Path2D(candidate.d));
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const output = new Uint8Array(mask.length);
    for (let i = 0; i < output.length; i++)
      output[i] = pixels[i * 4 + 3] >= 128 ? 1 : 0;
    const score = compareMasks(
      mask,
      output,
      image.width,
      image.height,
      limits.edgeRadius,
    );
    // Keep the least complex candidate within measured image fidelity bounds.
    if (
      acceptableTrace(score, image.width, image.height) &&
      (!best ||
        candidate.nodes < best.nodes ||
        (candidate.nodes === best.nodes && score.iou > best.iou))
    )
      best = { ...candidate, ...score };
  }
  if (!best) throw Error("轮廓与原图偏差过大，请调整描摹阈值后重试。");
  return best;
}
