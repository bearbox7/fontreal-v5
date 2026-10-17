[![部署 FontReal V5 到 Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bearbox7/fontreal-v5)

> 首次部署需登录你的 Render 账户，确认免费方案并设置 `STUDIO_PASSWORD`。请勿在 GitHub 仓库写入密码、AI API 密钥或收费服务凭证。

> **FontReal 公网部署入口：** 先阅读 [FONTREAL-上线指南.md](FONTREAL-上线指南.md)。

# 字境 FontLab × 字坊 Studio · V5 融合版

> 以用户提供的 `zifang-font-studio.zip` 中 **Next.js 16 / React 19 / TypeScript** 工作室为主工程，融合字境 V4 的国标编码、字体底库导入、单字多格式轮廓导入和海报导出。默认无付费 API 调用。

## 一、功能地图

| 功能 | 页面 | 状态/依赖 |
| --- | --- | --- |
| 字坊风格侧边栏、创作台、预设、参数调整、AI 风格分析入口 | 字体创作 | 沿用原包；AI 分析/重绘需要使用者服务器密钥 |
| 字形卡片、单字调整、节点、锚点、贝塞尔曲线和手柄、撤销重做 | 字符工坊 | 原包已具备；改动后需自行做浏览器验收 |
| 字形分批扩字、断点续接、反馈及参考字引用 | 字体创作 → 扩字 | 沿用原包；AI 图片生成按平台计费 |
| GB2312 一级汉字 3,755 字 | GB2312 国标字库 | 新增真实编码、区位、Unicode 对照 |
| GB2312 二级汉字 3,008 字 | 同上 | 新增检索和缺字检测；**内置底库不含二级字形** |
| GB2312 符号 682 个、完整 7,445 个字符 | 同上 | 新增 TXT / CSV 导出、编码检索 |
| 上传 TTF / OTF **用户授权的**源字体作为底库 | GB2312 国标字库 | 浏览器本地读入，能直接参与单字编辑与字体编译；仅在当前页面会话有效 |
| SVG、AI、EPS、TTF、OTF 作为**单字字形素材**导入 | 单字修改 → 导入素材 | Next API + Python 字形轮廓提取；AI 仅支持 PDF/PS 兼容文件 |
| JPG、PNG、WEBP 白底黑字素材描摹 | 单字修改 | 沿用原包浏览器描摹 |
| 导出真正可安装的 TTF 和 OTF | 字体创作及 GB2312 国标字库 | 浏览器 `opentype.js` / `fonteditor-core`，仅输出已有轮廓，不臆造缺字 |
| 输出覆盖率报告、缺字 TXT | GB2312 国标字库 | 随 TTF/OTF 同步下载 |
| 文字排版、前景/背景配色、2K/4K PNG、SVG | 在线试字 | 新增；SVG 字体跨设备一致性取决于对方有无该字体 |
| JSON 工程保存、导入、浏览器本地项目库 | 顶栏、我的字库 | 沿用原包 IndexedDB 保存；新增旧版 V4 轮廓 JSON 导入转换 |
| 旧版 V4 钢笔、矩形、复制/删除轮廓及撤销重做 | 侧边栏「经典钢笔 / 矩形绘制器」 | 保留单文件工具，独立工程；可导出 SVG/JSON 再迁入主应用 |

## 二、GB2312 的实际字形覆盖

标准只规定 **7,445 个字符编码**，不包括字形造型。随用户提供的源包附带的两种 Noto 子集实际覆盖：一级汉字 **3,755/3,755**、二级汉字 **0/3,008**、GB 符号 **40/682**。主界面会按实际源字体/编辑记录计算当前覆盖，并为每次 GB 范围导出下载缺字报告。不会把只有字位而没有轮廓的字符填成其他字，也不会宣称自动生成 6,763 个原创汉字。

想补齐二级汉字，上传有足够覆盖范围且**授权许可允许衍生**的 TTF/OTF 字体底库，或逐字编辑轮廓。上传的底库不会被自动保存到 JSON 项目，关闭页面后需要重新上传；工程字形修改可按项目 JSON 保存。

## 三、如何本机运行

要求 Node.js >=22.13、npm、Python 3.10+。在项目根目录：

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r server_tools/requirements.txt
npm run dev
```

打开 `http://127.0.0.1:5173`。Windows PowerShell 中激活虚拟环境为 `.venv\\Scripts\\Activate.ps1`。如仅操作基础字体创作、JPG/PNG 描摹和 TTF/OTF 浏览器导出，可先不装 Python；**SVG、AI、EPS、TTF/OTF 单字素材提取**需要 Python 服务依赖。AI/EPS 还需要系统命令 `inkscape` 与 `gs`（Ghostscript），并且 AI 要保存为 PDF/PS 兼容格式、文字转曲。含外链图、剪切蒙版和未扩展外观的矢量稿应先在设计软件中转为普通路径。

### 旧版立即可用入口

无需 npm，可单独双击 `public/tools/zijing-classic-editor.html` 使用 V4 的自由绘制编辑器（图片与简易 SVG 本地导入、路径编辑、SVG/JSON 导出）。此文件不是云服务，单独打开它不能调用 Next 的编译接口。

## 四、部署到公网

项目提供 `Dockerfile`、`render.yaml`、`railway.json`。将项目（不含 `node_modules` / `.env.local`）上传自己的 GitHub 仓库后，在 Render 或 Railway 选择 Docker 部署。生产镜像构建 Next.js、安装 Python 字形依赖、Inkscape 和 Ghostscript，并对外暴露 **8080** 端口。建议使用至少约 2 GB 内存的云实例处理大字体与复杂矢量稿。

建议在托管平台环境变量设置 `STUDIO_PASSWORD`；访问时输入用户名 `designer` 和所设密码，默认不开启验证。**只通过 HTTPS 公网使用密码。** AI 环境变量使用自己的服务账户配置在托管平台服务器侧（见 `.env.example`），绝不可放到浏览器前端。上传素材的服务器端转换有同源校验、文件大小和简单频率限制，但不能替代完整的登录鉴权、队列与沙箱隔离；开放多用户使用时应进一步添加账户、配额、文件扫描和严格容器隔离。

示例：

```bash
docker build -t zijing-zifang-v5 .
docker run --rm -p 8080:8080 -e STUDIO_PASSWORD=your-strong-password zijing-zifang-v5
```

然后访问 `http://127.0.0.1:8080`。**公网 URL 需要部署到使用者自己的云账户后才能获得，压缩包本身没有公网域名。** 默认项目保存在浏览器 IndexedDB，不跨浏览器同步。

## 五、设计/技术继承关系

- **来自上传的字坊包**：Next 前端、UI、字体风格参数、字体引擎、AI 接口框架、字形卡片、扩字、节点编辑、IndexedDB 和 TTF/OTF 输出。Noto 字体子集、许可文件和第三方 Potrace 许可照原样保留。
- **来自字境 V4**：精确 GB2312 编码分级和区位数据、SVG/AI/EPS/TTF/OTF 单字轮廓提取核心（迁移到 `server_tools/`）、经典自由绘制器。新增 TypeScript 与编码表交互层、可选字体底库、覆盖率输出与 PNG/SVG 排版导出。
- **数据不能直接互换的部分**：字坊使用自己的工程结构；本版新增 V4 `{version:"3.0",glyphs:{...}}` 工程 JSON 导入转换，但经典编辑器和主应用之间不会自动实时同步。可通过 JSON/SVG 迁移。

## 六、测试结果（避免误报）

已在本交付环境执行：

- Python `unittest` 的 4 项集成检查通过：GB2312 7,445 编码双向校验、SVG 路径提取、TTF + CFF OTF 编译及 cmap 回读、源码兼容入口。
- TypeScript 转译器语法解析通过：`studio.tsx`、`studio-editor.tsx`、`engine.ts`、字库模块、工程文件、素材导入路由和认证代理。
- 使用随包 Noto 子集检查实际 GB2312 覆盖数量，证实 **3755/0/40**，报告内容不夸大。

**仍需上线前完成：** 此次沙箱环境的 `npm ci` 因 npm 安装器故障退出（`Exit handler never called`），因此无法运行完整 `npm run check`、`npm run build`，也未实际进行新 Next UI 的 Chromium 点击验收或 Render/Railway 线上验收。不要把前述单元/静态验证等同于整站运行验证；在自己的联网开发环境安装依赖、运行 `npm run check` 和 `npm run build`，并检查导入/编辑/导出流程。

## 七、许可证与来源

原包随附 `public/fonts/OFL-Sans.txt`、`public/fonts/OFL-Serif.txt`、`public/licenses/potrace-GPL-2.0.txt`。字体底库和导出的派生字体应遵守各自的许可条件。请勿擅自导入或分发未经许可的商业字体。
