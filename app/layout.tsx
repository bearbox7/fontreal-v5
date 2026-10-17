import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FontReal V5 · 中文在线字体设计工作室",
  description:
    "让每个字，都有自己的表达。支持 GB2312-1980 字库、中文字体在线节点编辑、JPG/PNG/SVG/AI/EPS 源文件导入，以及 TTF/OTF 字体编译与缺字检测。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
