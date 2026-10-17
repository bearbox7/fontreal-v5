# FontReal V5 · Google Gemini + OpenAI 双模型接入

本版本支持同时保留两个独立的 AI 服务：**OpenAI 官方 API** 与 **Google Gemini API**。
在 FontReal 网站的 **AI 服务设置** 中可以随时切换，服务商之间没有共享密钥或自动扣费。
**每次分析/生成只调用当前选中的一个服务**；并不同时调用两家，也暂不提供双结果并排比较。

## 1. 注册/获取服务端密钥

- OpenAI API：[https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)。
  ChatGPT Plus/Pro 与 OpenAI API 分开计费，需要在开发者平台配置 API 额度与可用模型。
- Gemini API：[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)。
  按 Google AI Studio 的账户、地区与配额开通；图片生成不保证有免费额度。

**密钥不要发送到聊天、截图、GitHub，也不要放到以 NEXT_PUBLIC_ 开头的浏览器变量。**

## 2. Render 同时填写下面 7 项环境变量

进入 Render Dashboard → `fontreal-v5` → **Environment**：

| 名称 | 值 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI 开发者平台创建的真实密钥 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_ANALYSIS_MODEL` | `gpt-4.1-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` |
| `GEMINI_API_KEY` | Google AI Studio 创建的真实密钥 |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.6-flash` |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` |

模型名称是基于官方文档推荐的起点；可能因 API 开通、地区、余额或模型升级无法调用，请以两个开发者控制台实际支持的模型为准。

**如果以前填过 302.AI 的密钥，请同时替换 `OPENAI_API_KEY` 与 `OPENAI_BASE_URL`**；302.AI 的密钥不能直接拿来调用 OpenAI 官方 API。

保留原来的 `STUDIO_PASSWORD`，未设置时建议先添加强密码保护所有付费接口，防止网站访客消耗账户额度。代码中默认使用账号 `designer` 和你设置的密码保护工作室；健康检查接口不需要密码。给各个平台设置预算和速率上限，不要向不受信任的访客开放无限额度。

配置全部保存后，点击 **Save, deploy** 或 **Save and deploy**，等待 Render 最新版本显示 Live。

## 3. 验证是否配置完成

依次访问：

1. `https://fontreal.pages.dev/api/health`：检查后端 `ok:true`。
2. `https://fontreal.pages.dev/api/status`：`providers.openai` 与 `providers.gemini` 均为 `true` 时表示该服务所需的密钥及两个模型名称已经写入服务器。
3. 回到 `https://fontreal.pages.dev` 刷新，进入 **AI 服务设置**，应该看到两个服务都显示「已配置」。
4. 先选择 Google Gemini，使用一张无版权风险的小图做一次风格分析及 **单字生成**。
5. 再切换 OpenAI GPT Image 测试同一个汉字；两次生成分别计费。

**注意：** `/api/status` 只报告环境变量是否填写，不做对外付费试调用；状态变绿不意味着授权成功、余额充足或者图片生成端点一定兼容。

## 4. 失败排查

- 「未配置」：确认七项变量拼写、所在服务、Render 新版本是否 Live，刷新页面。
- 401/403：API Key 不正确、账户权限不足或密钥与平台混用。
- 400：模型不支持当前结构化输出、图片尺寸、图片编辑请求，或者模型名称不正确。
- 429：额度、速率或并发限制。
- 502/504：服务商上游故障或 Render 免费实例网络/超时问题。
- Google 图片模型需要支持 `generateContent` 且能返回 inlineData；若模型更新则同步升级接口。

## 5. 费用和字体文件说明

OpenAI/Gemini 两家 API 分别计费；开启两家不会自动并行调用。
字体 AI 生成结果是图片，仍需转换字形轮廓、人工核对部件结构与缺字，再导出 TTF/OTF。
GB2312 的 7,445 字位不等于 7,445 个独立生成的可安装字形。

官方参考：
- OpenAI 图片 API：https://developers.openai.com/api/docs/guides/image-generation
- Google Gemini 图片生成（GenerateContent 兼容）：https://ai.google.dev/gemini-api/docs/generate-content/image-generation
