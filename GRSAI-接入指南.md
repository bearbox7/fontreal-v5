# FontReal V5 · 第三个 AI 服务：GrsAI

GrsAI 是第三方模型聚合平台（不是用户自己架设的 API 服务器）。此功能保留现有 OpenAI 与 Google Gemini 两个独立服务，不修改其 API Key。

## 1. 在 GrsAI 账户申请 API Key

官网：https://grsai.ai/
密钥管理：https://grsai.ai/zh/dashboard/api-keys

建议创建名为 FontReal 的专用密钥并设置使用额度。密钥不要发到聊天、截图或 GitHub 仓库。

## 2. 在 Render > fontreal-v5 > Environment 配置

| Key | Value |
| --- | --- |
| `GRSAI_API_KEY` | 你的 GrsAI API Key（只在 Render 设置） |
| `GRSAI_BASE_URL` | `https://grsaiapi.com`（全球节点） |
| `GRSAI_ANALYSIS_MODEL` | `gemini-2.5-flash`（需确认账户可用且支持图像分析） |
| `GRSAI_IMAGE_MODEL` | `gpt-image-2.5-flare`（需确认账户可用） |

国内节点可改为 `https://grsai.dakka.com.cn`。

**不要把 https://grsai.ai/zh/v1 填作 GRSAI_BASE_URL**：它是文档页面，并非 API 请求地址。

保持 `OPENAI_*` 和 `GEMINI_*` 变量不变；GrsAI 使用独立的 `GRSAI_*` 变量。

为了避免别人从公网调用付费 API，请在 Render 保留 `STUDIO_PASSWORD`，同时在 GrsAI 控制台为密钥设置用量上限。

保存变量并等待 Render 完成最新部署（Live）。

## 3. 如何验证

- 打开 https://fontreal.pages.dev/api/status；检查 `providers.grsai` 是否为 true。
- 在 https://fontreal.pages.dev 打开 AI 服务设置，选择 **GrsAI · 自有 API**。
- 用一句字体风格描述做分析，确认能返回结构化结果。
- 再尝试**只生成一个汉字**。此操作可能扣除 GrsAI 积分。
- 使用 JPG/PNG 参考图进行图生图；GrsAI 对内联 data URL 的兼容性需在拥有真实 API Key 后实测。如报错请提供 Render Logs 的脱敏信息以进一步适配。
- 当前 GrsAI 在 FontReal 优先采用**单字逐字生成**；原 OpenAI 4K 字表批量功能保持原样，并未自动启用 GrsAI 批量。

`/api/status` 返回 true 仅表示密钥和模型名已填写，不代表余额、权限及生成请求已经验收。

## 4. 接口实现

- 图片风格分析：`POST https://grsaiapi.com/v1/chat/completions`，使用服务器密钥调用视觉分析模型。
- 图片生成/编辑：`POST https://grsaiapi.com/v1/api/generate`，请求体有 `model`、`prompt`、`images`、`aspectRatio`、`quality`、`replyType:json`。
- 返回的图片必须来自限定的 GrsAI 图片域名，以防服务器任意抓取不可信地址。若 GrsAI 变更图片下载域名，需要人工审核并扩充白名单。
- 不会向浏览器透露 API Key；`providers.grsai` 为 false 时不会发起付费调用。

参考官方接口文档：
- https://qmy27nhsd9.apifox.cn/452409160e0
- https://qmy27nhsd9.apifox.cn/452418916e0
- https://qmy27nhsd9.apifox.cn/452409577e0
