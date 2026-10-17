# FontReal V5 完整版上线指南（Cloudflare Pages + Render）

## 你现在拥有的域名

`https://fontreal.pages.dev` 已经部署了基础版。**不要删除这个 Cloudflare Pages 项目**，完整版仍然使用同一地址。

## 两个独立的部署部分

1. 本压缩包是完整的 Next.js 16 / React 19 / Python 字形处理工程。Render（或其他能运行 Docker 的服务器）负责运行它；提供 `/api/*`、TTF/OTF 字体编译、GB2312 字库以及矢量文件处理。
2. 另一个压缩包 `FontReal-Cloudflare-完整版接入包.zip` 是 Cloudflare Pages 接入层，负责将 `fontreal.pages.dev` 的流量转发到上面的 Next 服务。当未配置后端地址时，它会自动继续展示已有静态版。

本包**不是**直接拖入 Cloudflare Pages 的静态 ZIP。直接上传本包不能启动 Next/Python 服务。

## A. 先在 Render 部署完整 V5 后端

1. 从 ZIP 解压本工程，将**解压后项目根目录下的文件**提交到你自己的 GitHub 私有仓库（别只上传一个 ZIP 文件；不得提交 `.env.local` 或 API 密钥）。
2. 在 https://dashboard.render.com/ 登录 → New → Web Service → 连接刚才的 GitHub 仓库。
3. 选择 **Docker**（仓库带 `Dockerfile`），实例可以先选择 Free 用于测试；或选择适合正式使用的付费配置。已有 `render.yaml` 中的 Free 设置仅适合试运行。
4. 推荐配置 `STUDIO_PASSWORD`：使用密码保护工作室，避免别人滥用 AI API；不要在浏览器中公开 API 密钥。后续启用 AI 时，在 Render 环境变量中设置 `OPENAI_API_KEY` / `OPENAI_ANALYSIS_MODEL` / `OPENAI_IMAGE_MODEL` 或 Gemini 相应变量。
5. 等待构建完成，拿到一个类似 `https://fontreal-v5-xxxx.onrender.com` 的**实际**地址。这个示例不是预先分配的固定网址。
6. 打开 `https://你的Render地址/api/health`，预期看到 `{"ok":true,"app":"FontReal V5",...}`。若配置了 STUDIO_PASSWORD，浏览器会要求输入用户名 `designer` 和你的密码（健康检查路径除外）。
7. **先验证 Render 地址能打开完整版 V5，能导出 TTF/OTF；再改 Cloudflare。**

> Render 官方 Free Web Service 有 512MB RAM、空闲约 15 分钟后休眠和每月用量限制；对大型字体编译、Inkscape 和 Ghostscript 不承诺稳定。生产使用建议至少 2GB 内存，可自行选择付费方案。云端第三方 AI 接口使用量可能产生额外费用。Docker 构建依赖网络，实际平台可用性需上线测试。

## B. 在 Cloudflare Pages 启用 V5 代理（保留原免费域名）

1. 下载 **另一个** `FontReal-Cloudflare-完整版接入包.zip`。
2. Cloudflare Dashboard → Workers 和 Pages → `fontreal` → **设置** → **环境变量和密钥**，新增纯文本变量：
    - 变量名：`FONTREAL_BACKEND_ORIGIN`
    - 变量值：`https://你的Render实际地址.onrender.com`（不带末尾 `/`，不要填示例 URL）
    - 环境：Production / 生产环境。
3. 进入 `fontreal` → **部署** → **创建部署 / Upload assets**，上传 Cloudflare 接入包 ZIP，部署到生产环境。
4. 打开 https://fontreal.pages.dev 刷新。原始网址保持不变，但页面会显示完整 FontReal V5。新版如果短时间未显示，检查变量生效及对应生产部署。
5. 如 Render 下线或变量被删除，代理会回退到静态编辑器。网页版首页仍能正常显示，但 AI/Python 能力要靠后端。

**注意：** Cloudflare Dashboard 拖拽上传不能编译 `functions/` 目录，本接入包使用官方支持的 Pages Advanced Mode `_worker.js`。第一次启用后请测试上传、登录、导出和更新功能。若 Render 使用 Basic Auth，代理保留浏览器认证请求，用户名为 `designer`。

## C. 逐项验收

- 主页面是否显示 `FontReal V5`、能切换字坊完整版的导航、打开国标字库。
- 任意选一个有轮廓的汉字，拖动节点、撤销/保存/再次打开工程。
- 导出 `.ttf` 和 `.otf`，在系统字体管理软件中打开；检查 GB2312 缺字报告，不将 6763 字位误认为全部有可用轮廓。
- 上传 PNG/JPG 描摹；上传 SVG 提取路径；AI/EPS 需 Inkscape/Ghostscript，AI 文件须 PDF/PS 兼容且文字已转曲。
- 如配置 AI 密钥，测试分析/扩字，留意 API 额度、配额和服务端鉴权。

## D. 已知限制与真实状态

- 当前提供的是**可部署源码和 Cloudflare 代理接入包**；仅凭压缩包不代表已在你的 Render/Cloudflare 账户中完成升级。
- 本环境 Node 依赖无法访问 npm registry，因此未完成 Next.js 生产构建或在线端到端验收。你部署时 Render/GitHub 会执行构建；遇到构建失败需查看日志继续修复。
- Cloudflare Pages 在此架构负责代理和免费域名；Python / AI 服务在你另行管理的 Docker 后端。
- 项目存在浏览器本地存储机制，但不等于用户账户/跨设备云同步。AI 密钥一定放在后端环境变量，不要填在网站前端。
- 不要未经许可上传/分发商业字体。Noto 字体和 Potrace 许可证仍随包提供。

## E. 常见问题

**打开 pages.dev 仍是旧版？** 确认 Render 的 `/api/health` 正常、Cloudflare `FONTREAL_BACKEND_ORIGIN` 环境变量属于 Production、Cloudflare 接入包已成功部署。

**页面 502/503？** 检查 Render 服务是否正在休眠、构建失败、内存不足或健康检查不通过。免费服务唤醒可能需要约 1 分钟。

**AI 按钮显示未配置？** 在 Render 设置服务器端服务密钥和对应的模型名后重启实例。平台的 AI API 不一定免费，注意使用权限与额度。

**Cloudflare 环境变量需要填原 Pages 域名吗？** 不需要；填写 Render 的公网 HTTPS 网址。千万不要填 `https://fontreal.pages.dev`，否则会造成代理循环。
