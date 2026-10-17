# FontReal V5 · 在线中文字体设计平台

本仓库用于部署 FontReal V5 完整版（Next.js 16 + React 19 + TypeScript + Python 字形转换服务）。

## 目标网站
- 公网入口：[fontreal.pages.dev](https://fontreal.pages.dev)
- 后端：支持 Docker 的托管平台（如 Render）
- 通过 Cloudflare Pages 代理连接后端，保持现有域名不变

## 功能目标
- GB2312-1980 字库字位管理、检索与缺字报告
- 字形轮廓、贝塞尔节点及手柄编辑
- TTF / OTF 字体文件导出
- PNG / JPG / SVG 以及 PDF 兼容 AI / EPS 素材处理
- AI 字形分析与生成（需服务端密钥；按服务商计费）

**当前状态：** 此仓库仅初始化了部署基础配置，完整 V5 项目源码和静态资源仍需上传；在文件齐全、构建通过并配置后端之前，不能将本仓库视为已可运行的完整版。

## 将完整 V5 源码加入本仓库
从聊天记录中下载 `FontReal-V5-完整版服务端-部署源码.zip`，先在本地解压，将解压目录**内部**的文件放到仓库根目录。应包含：
`app/`、`components/`、`lib/`、`public/`、`server_tools/`、`package.json`、`package-lock.json`。

不要提交 `.env`、`.env.local`、`node_modules/` 或 API 密钥。

## 本机验证
需要 Node.js >=22.13、Python 3.10+：

```bash
npm ci
npm run check
npm run build
python3 -m pip install -r server_tools/requirements.txt
python3 -m unittest discover -s tests -v
```

## Render 部署
选择此仓库，使用 Docker 构建（仓库根目录的 `Dockerfile`），健康检查路径 `/api/health`。先设置 `STUDIO_PASSWORD` 为强密码；AI 密钥只在托管平台的服务端环境变量中配置，切勿写入仓库。

免费实例可能内存不足或闲置休眠；实际线上运行、图片处理与字体编译需在部署后验收。

## Cloudflare 域名
`fontreal.pages.dev` 仍属于现有 Cloudflare Pages 项目。只有完成后端部署并配置 Cloudflare 转发，才会将完整 V5 提供给访客；单独推送 GitHub 不会自动升级已上线的网站。
