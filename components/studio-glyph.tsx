"use client";
import { writeGlyphPath } from "@/lib/font/svg-path";
import { useEffect, useState } from "react";
import { glyphPath } from "@/lib/font/engine";
import type { StyleConfig, GlyphEdits } from "@/lib/font/types";
export default function Glyph({
  char,
  style,
  edits = {},
  grid = false,
}: {
  char: string;
  style: StyleConfig;
  edits?: GlyphEdits;
  grid?: boolean;
}) {
  const [d, set] = useState("");
  useEffect(() => {
    let live = true;
    glyphPath(char, style, edits)
      .then((p) => {
        if (live) set(writeGlyphPath(p));
      })
      .catch(() => {
        if (live) set("");
      });
    return () => {
      live = false;
    };
  }, [char, style, edits]);
  return (
    <svg viewBox="0 0 1000 1000" role="img" aria-label={char}>
      {grid && (
        <path
          d="M0 0H1000V1000H0ZM500 0V1000M0 500H1000M0 0L1000 1000M1000 0L0 1000"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="3"
        />
      )}
      <g transform="translate(0 880) scale(1 -1)">
        <path d={d} fill="currentColor" />
      </g>
    </svg>
  );
}
