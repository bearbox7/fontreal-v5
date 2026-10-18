[![部署 FontReal V5 到 Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bearbox7/fontreal-v5)

> 首次部署需登录你的 Render 账户，确认免费方案并设置 `STUDIO_PASSWORD`。请勿在 GitHub 仓库写入密码、AI API 密钥或收费服务凭证。

> **FontReal 公网部署入口：** 先阅读 [FONTREAL-上线指南.md](FONTREAL-上线指南.md)。

# 字境 FontLab × 字坊 Studio · V5 融合版

> 以用户提供的 `zifang-font-studio.zip` 中 **Next.js 16 / React 19 / TypeScript** 工作室为主工程，融合字境 V4 的国标编码、字体底库导入、单字多格式轮廓导入和海报导出。默认无付费 API 调用。

## 一、功能地图

> 主站已移除旧的「经典钢笔 / 矩形绘制器」独立入口与页面，**不影响「字符工坊」内的贝塞尔节点、描摹、SVG 矢量编辑及 TTF/OTF 导出**。百炼逐字生成现在采用风格参考图（优先）加汉字结构骨架（仅校正笔画），提高样式连贯性；模型输出仍需人工核对，无法保证与原图完全一致。

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

## 参考图已有汉字：优先原样提取，不要重复交给 AI 绘制

图片生成模型（包括 Qwen-Image）对中文字形的逐笔风格传递并不可靠，即使给出笔画提示词和骨架，也无法保证一致。**如果参考图本身已经包含目标字，最准确的方法是提取原图轮廓，而不是让 AI 再画同一个字。**

操作：上传含目标文字的 PNG/JPG/WEBP 网格图 → 在「测试预览文字」输入与参考图一致的文字顺序（从左到右、从上到下，每格一个字）→ 在右侧选择「**原样提取参考字 · 不调用 AI**」，设置网格列数、行数（例如 20 字的两行十列：列数 10，行数 2）→ **预览裁切**，逐格核对标签与图像 → 确认后矢量描摹导入。确认导入会覆盖同名已编辑/已生成字形，因此在覆盖前建议先导出项目 JSON 备份。非等距或非网格图片不适合使用这个模式。

提取流程将深色字形测量裁切、居中缩放并使用项目原有的高保真矢量描摹生成路径，保留原有笔画轮廓。**不产生 AI 调用费用**，可以继续在「字符工坊」编辑节点并导出 TTF/OTF。位图转路径仍可能存在少量边缘近似，建议核对精细尖角、细笔画和字腔。

**对于原图中没有的汉字**，仍需 AI 辅助生成、人工设计或使用有权使用的底库字形。不要将 AI 图像生成等同于专业的、已经验证能复制整套中文字形设计语言的字体合成器。创作工作区现在会提示尚未完成的字使用基础字体占位，防止误把混合预览当成全部生成结果。

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

## 四、部署到公网

项目提供 `Dockerfile`、`render.yaml`、`railway.json`。将项目（不含 `node_modules` / `.env.local`）上传自己的 GitHub 仓库后，在 Render 或 Railway 选择 Docker 部署。生产镜像构建 Next.js、安装 Python 字形依赖、Inkscape 和 Ghostscript，并对外暴露 **8080** 端口。建议使用至少约 2 GB 内存的云实例处理大字体与复杂矢量稿。

建议在托管平台环境变量设置 `STUDIO_PASSWORD`；访问时输入用户名 `designer` 和所设密码，默认不开启验证。**只通过 HTTPS 公网使用密码。** AI 环境变量使用自己的服务账户配置在托管平台服务器侧（见 `.env.example`），绝不可放到浏览器前端。上传素材的服务器端转换有同源校验、文件大小和简单频率限制，但不能替代完整的登录鉴权、队列与沙箱隔离；开放多用户使用时应进一步添加账户、配额、文件扫描和严格容器隔离。

示例：

```bash
docker build -t zijing-zifang-v5 .
docker run --rm -p 8080:8080 -e STUDIO_PASSWORD=your-strong-password zijing-zifang-v5
```

然后访问 `http://127.0.0.1:8080`。**公网 URL 需要部署到使用者自己的云账户后才能获得，压缩包本身没有公网域名。** 默认项目保存在浏览器 IndexedDB，不跨浏览器同步。

## 阿里云百炼 Qwen Image 接入（可选）

FontReal 可在 **AI 服务设置**中独立选择 **阿里云百炼 · Qwen Image**，支持参考图风格分析、单字生成和参考图重绘；不需要更改原有 OpenAI 或 Gemini 密钥。已有的单字节点编辑、矢量导入和 TTF/OTF 导出均保持不变。**32/72 字整版大图模式仍仅支持 OpenAI**，百炼请选择逐字生成模式；逐字调用可能产生多次计费。

在 Render → fontreal-v5 → Environment 中配置：

```dotenv
BAILIAN_API_KEY=请填百炼控制台创建的密钥（不要提交到 GitHub）
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com
BAILIAN_ANALYSIS_MODEL=qwen3-vl-plus
BAILIAN_IMAGE_MODEL=qwen-image-3.0
```

**地域必须一致**：北京地区采用 `https://dashscope.aliyuncs.com`；新加坡地区采用 `https://dashscope-intl.aliyuncs.com`。若使用百炼新版业务空间专属域名，请将 `BAILIAN_BASE_URL` 改成与你的业务空间一致的官方 `https://{WorkspaceId}.<region>.maas.aliyuncs.com` **根域名**（不带 `/api/v1`）。模型在该地域不可用时，请在控制台选用支持的 Qwen 视觉分析模型和 Qwen-Image 模型，不能跨地域复用密钥。

Qwen-Image 3.0 每次编辑最多支持 **3 张参考图片**。如果绘制时需要同时传入更多跨字参考、标注图，可根据控制台可用模型切换为支持最多 10 张参考图的 `qwen-image-2.1` 系列，并先进行单字测试。图像生成接口返回的临时签名图片由服务器验证并转换为 PNG/JPEG/WEBP Data URL，避免 24 小时后原始链接失效。

**已配置 ≠ API 成功或有免费额度**：绿色状态点只说明 Render 已设置密钥和模型变量。百炼是否提供试用额度与模型地域相关，请在控制台确认并配置费用上限。建议首次只生成一个「永」字，不要直接运行大量汉字扩字。不要将 API Key 贴在聊天、截图或 GitHub。

百炼 API 官方文档：[Qwen Image 生成与编辑](https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference) · [视觉模型 OpenAI 兼容接口](https://help.aliyun.com/zh/model-studio/qwen-vl-compatible-with-openai)。

## 五、设计/技术继承关系

- **来自上传的字坊包**：Next 前端、UI、字体风格参数、字体引擎、AI 接口框架、字形卡片、扩字、节点编辑、IndexedDB 和 TTF/OTF 输出。Noto 字体子集、许可文件和第三方 Potrace 许可照原样保留。
- **来自字境 V4**：精确 GB2312 编码分级和区位数据、SVG/AI/EPS/TTF/OTF 单字轮廓提取核心（迁移到 `server_tools/`）。新增 TypeScript 与编码表交互层、可选字体底库、覆盖率输出与 PNG/SVG 排版导出。
- **数据不能直接互换的部分**：字坊使用自己的工程结构；本版支持 V4 `{version:"3.0",glyphs:{...}}` 工程 JSON 导入转换，也可通过 SVG 导入已有字形。

## 六、测试结果（避免误报）

已在本交付环境执行：

- Python `unittest` 的 4 项集成检查通过：GB2312 7,445 编码双向校验、SVG 路径提取、TTF + CFF OTF 编译及 cmap 回读、源码兼容入口。
- TypeScript 转译器语法解析通过：`studio.tsx`、`studio-editor.tsx`、`engine.ts`、字库模块、工程文件、素材导入路由和认证代理。
- 使用随包 Noto 子集检查实际 GB2312 覆盖数量，证实 **3755/0/40**，报告内容不夸大。

**仍需上线前完成：** 此次沙箱环境的 `npm ci` 因 npm 安装器故障退出（`Exit handler never called`），因此无法运行完整 `npm run check`、`npm run build`，也未实际进行新 Next UI 的 Chromium 点击验收或 Render/Railway 线上验收。不要把前述单元/静态验证等同于整站运行验证；在自己的联网开发环境安装依赖、运行 `npm run check` 和 `npm run build`，并检查导入/编辑/导出流程。

## 七、许可证与来源

原包随附 `public/fonts/OFL-Sans.txt`、`public/fonts/OFL-Serif.txt`、`public/licenses/potrace-GPL-2.0.txt`。字体底库和导出的派生字体应遵守各自的许可条件。请勿擅自导入或分发未经许可的商业字体。
