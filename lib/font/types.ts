export type StyleConfig = {
  base: "sans" | "serif";
  weight: number;
  width: number;
  roundness: number;
  slant: number;
  tracking: number;
};
export type GlyphEdit = {
  scale: number;
  rotate: number;
  x: number;
  y: number;
  path?: string;
  manuallyEdited?: boolean;
  version: number;
  sourceImage?: string;
  model?: string;
  prompt?: string;
  createdAt?: string;
  generatedStyle?: StyleConfig;
  redrawComments?: {x: number; y: number; text: string}[];
  redrawPrompt?: string;
  redrawReference?: string;
  pendingGeneration?: {
    image: string;
    model: string;
    prompt: string;
    createdAt: string;
    style: StyleConfig;
  };
  traceStats?: { nodes: number; fidelity: number; tolerance: number };
  sheetSlot?: {
    character: string;
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
export type GlyphEdits = Record<string, GlyphEdit>;
export type Analysis = {
  description: string;
  category: string;
  tags: string[];
  characters: {
    character: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  style: StyleConfig;
};
export const DEFAULT_STYLE: StyleConfig = {
  base: "sans",
  weight: 600,
  width: 100,
  roundness: 0,
  slant: 0,
  tracking: 0,
};
export const PRESETS: {
  id: string;
  name: string;
  en: string;
  sample: string;
  color: string;
  style: StyleConfig;
}[] = [
  {
    id: "modern",
    name: "现代黑体",
    en: "MODERN SANS",
    sample: "字有力量",
    color: "#e7e8de",
    style: { ...DEFAULT_STYLE, weight: 600 },
  },
  {
    id: "editorial",
    name: "人文宋体",
    en: "HUMANIST SERIF",
    sample: "山川有信",
    color: "#eee3d6",
    style: { ...DEFAULT_STYLE, base: "serif", weight: 400 },
  },
  {
    id: "soft",
    name: "温柔圆角",
    en: "SOFT & FRIENDLY",
    sample: "好好生活",
    color: "#e4e7df",
    style: { ...DEFAULT_STYLE, weight: 400, roundness: 75 },
  },
  {
    id: "poster",
    name: "先锋海报",
    en: "BOLD DISPLAY",
    sample: "不止于字",
    color: "#e4ddec",
    style: { ...DEFAULT_STYLE, weight: 800, width: 80, slant: 8 },
  },
];
