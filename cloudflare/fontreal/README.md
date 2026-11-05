# fontreal: existing FontReal Cloudflare Pages project, automated safely

## Why this is a proxy and not a Next.js static export

FontReal V5 uses Next.js 16 server route handlers and a Python subprocess for AI/EPS/font imports. Publishing `.next` or a forced `output: export` to Pages would break server features.

Keep the working Next.js + Python application on Render (or another Docker host), and retain the original Cloudflare Pages Advanced Mode proxy with its static fallback assets. This workflow uploads **only** the prepared Pages bundle to the existing **fontreal** project. It must never create a new Pages project.

## One-time setup

1. **Completed:** The original Pages access bundle has been verified byte-for-byte against the uploaded `legacy.zip` and committed at `cloudflare/fontreal/legacy.zip`. Do not reupload it. The workflow substitutes the reviewed `cloudflare/fontreal/_worker.js` for the legacy worker while preserving the original `index.html` and font assets.
2. In the Cloudflare dashboard, open **Workers & Pages → fontreal → Settings → Variables and Secrets**. For the production environment, set `FONTREAL_BACKEND_ORIGIN` to your **actual** working Render HTTPS root URL (no path, trailing slash or Pages domain). Configure the preview environment too if you want to test the proxy with Render before production.
3. At Cloudflare **My Profile → API Tokens**, create a token restricted to your own account with **Account → Cloudflare Pages → Edit** permissions.
4. In GitHub **bearbox7/fontreal-v5 → Settings → Secrets and variables → Actions**, create two repository **secrets** named `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Never commit actual values, passwords or AI API keys.
5. After reviewing and merging this PR into **main** (production is still protected while the variable is unset), open GitHub **Actions** and choose **Deploy existing fontreal Cloudflare Pages project** → **Run workflow** → `preview`. The preview uses a dedicated non-production branch `fontreal-ci-preview`. Verify the reported preview URL, `/__fontreal_mode`, and your glyph upload / AI calls.
6. After preview passes, add repository **variable** `FONTREAL_AUTO_DEPLOY=true`. At this point pushes to `main` start automated production publishing; you can also manually trigger `production`. Leave it unset or `false` until you are ready.

## Safety

- The workflow queries Cloudflare's API and confirms `fontreal` **already exists** before invoking Wrangler. It does not create or delete sites.
- It fetches the project's **existing production branch name** instead of assuming that `main` is the Cloudflare production branch. Preview deployments cannot overwrite production.
- It will fail without the original ZIP, token, account ID, or explicit production opt-in. In those cases, your existing Pages site stays unchanged.
- The included Advanced Mode worker forwards traffic to your verified backend. When no backend URL is set, it serves the preserved legacy static editor through `env.ASSETS`.
- GitHub Actions deploying this Pages proxy **does not deploy or update your Render backend**. Enable automatic Git-based deployments separately in Render for the same repository so that edits to Next.js/Python go live.
- This is not native Git integration in the Cloudflare dashboard: it is GitHub Actions + Wrangler continuous integration targeting the same existing Direct Upload project.
- The first production update must be verified on the actual `https://fontreal.pages.dev` site, including authentication, font uploads, AI calls, and asset URLs. Do not equate a green Action with an end-to-end site test.

Cloudflare documentation:
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
