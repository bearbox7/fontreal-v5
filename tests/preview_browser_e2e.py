"""Non-destructive smoke tests against FontReal Preview only.
No paid AI generation or production deployment. Browser storage is temporary.
"""
import json
import re
import sys
import traceback
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

PREVIEW="https://fontreal-ci-preview.fontreal.pages.dev"
assert urlparse(PREVIEW).hostname=="fontreal-ci-preview.fontreal.pages.dev"
ok=[]
bad=[]
INFO={}

def check(name,run):
    print("\nTEST",name,flush=True)
    try:
        result=run()
        ok.append(name)
        print("PASS",name,":",str(result)[:350],flush=True)
    except Exception as e:
        bad.append((name,str(e)))
        print("FAIL",name,":",repr(e),flush=True)
        traceback.print_exc(limit=3)

def font_valid(path, expected_type, expected_unicode):
    with TTFont(str(path), lazy=False) as font:
        kind="otf" if font.sfntVersion == "OTTO" else "ttf"
        assert kind==expected_type,f"Expected {expected_type}, got {kind}"
        cmap=font.getBestCmap() or {}
        assert ord(expected_unicode) in cmap, f"{expected_unicode} not found in cmap"
        assert len(cmap)>0, "Empty cmap"
        return f"valid {kind}, {len(cmap)} chars, U+{ord(expected_unicode):04X} present"

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=["--no-sandbox"])
    context=browser.new_context(accept_downloads=True,locale="zh-CN",viewport={"width":1440,"height":900})
    page=context.new_page()
    page.set_default_timeout(25000)
    page.on("pageerror", lambda err: print("BROWSER_JS_ERROR",str(err)[:300],flush=True))

    def health():
        r=context.request.get(PREVIEW+"/api/health",timeout=45000)
        assert r.status==200,f"/api/health HTTP {r.status}"
        v=r.json()
        assert v.get("app")=="FontReal V5" and v.get("ok") is True,v
        return v
    check("live Preview API /api/health",health)

    def mode():
        r=context.request.get(PREVIEW+"/__fontreal_mode",timeout=45000)
        assert r.status==200,f"/__fontreal_mode HTTP {r.status}"
        v=r.json()
        assert v.get("mode")=="full-v5-proxy" and v.get("backendConfigured") is True,v
        return v
    check("live Preview Proxy full-v5 mode",mode)

    def assets():
        r=context.request.get(PREVIEW+"/fonts/sans-400.ttf",timeout=45000)
        assert r.status==200,f"font HTTP {r.status}"
        data=r.body()
        assert len(data)>100000, f"font suspiciously small ({len(data)})"
        font=TTFont(BytesIO(data))
        n=len(font.getBestCmap() or {})
        font.close()
        assert n>100,"Font cmap missing"
        r=context.request.get(PREVIEW+"/fonts/gb2312-full.json",timeout=45000)
        assert r.status==200,f"GB2312 HTTP {r.status}"
        j=r.json()
        assert len(j.get("all",[]))==7445, f"GB2312 records wrong keys: {list(j)}"
        return f"font bytes={len(data)}, cmap={n}; GB2312 7445 records"
    check("browser-loadable base fonts and GB2312",assets)

    def provider_status():
        r=context.request.get(PREVIEW+"/api/status",timeout=45000)
        assert r.status==200,f"/api/status HTTP {r.status}"
        v=r.json()
        providers=v.get("providers")
        assert isinstance(providers,dict)
        assert all(isinstance(providers.get(k),bool) for k in ("openai","gemini","bailian")),v
        INFO["providers"]=providers
        return f"provider settings present (not credentials or actual generation): {providers}"
    check("AI providers configured status (read-only)",provider_status)

    def no_cost_ai_route():
        r=context.request.post(
            PREVIEW+"/api/glyph",
            data=json.dumps({"provider":"openai","character":"XX","style":{}}),
            headers={"Content-Type":"application/json","Origin":PREVIEW},
            timeout=45000
        )
        assert r.status==400,f"invalid request expected 400, got {r.status} {r.text()[:200]}"
        v=r.json()
        assert isinstance(v.get("error"),str)
        return "invalid glyph request correctly rejected; no AI provider invoked"
    check("AI POST request validation (no paid call)",no_cost_ai_route)

    def svg_import():
        svg=b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10L90 10L90 90L10 90Z"/></svg>'
        r=context.request.post(
            PREVIEW+"/api/assets/import",
            multipart={"file":{"name":"preview-test.svg","mimeType":"image/svg+xml","buffer":svg},"char":"中"},
            headers={"Origin":PREVIEW},
            timeout=70000
        )
        assert r.status==200,f"import HTTP {r.status}: {r.text()[:300]}"
        v=r.json()
        assert v.get("ok") is True and v.get("paths"), f"Invalid SVG import: {str(v)[:300]}"
        return f"SVG imported, path count={len(v['paths'])}"
    check("Preview server-side SVG artwork import",svg_import)

    def frontend():
        r=page.goto(PREVIEW+"/",wait_until="domcontentloaded",timeout=60000)
        assert r and r.status==200,f"frontend HTTP {r.status if r else 'none'}"
        page.get_by_role("button",name="字符工坊").wait_for(timeout=45000)
        page.locator("nav button").filter(has_text="GB2312 国标字库").wait_for(timeout=45000)
        page.get_by_role("button",name="在线试字").wait_for(timeout=45000)
        return "React UI and main sections mounted"
    check("live Preview frontend React hydration",frontend)

    def node_edit():
        page.get_by_role("button",name="字符工坊").click()
        cards=page.locator("button.glyph-open")
        cards.first.wait_for(timeout=45000)
        c=cards.first.get_attribute("aria-label")
        cards.first.click()
        modal=page.get_by_role("dialog",name="字符编辑器")
        modal.wait_for(timeout=45000)
        modal.get_by_role("button",name=re.compile("编辑节点")).click()
        nodes=page.get_by_role("dialog",name="字形节点编辑器")
        nodes.wait_for(timeout=45000)
        anchors=nodes.locator("svg.node-stage [aria-label^='轮廓']")
        anchors.first.wait_for(timeout=45000)
        anchors.first.click()
        edit=nodes.get_by_role("spinbutton",name="锚点 X 坐标")
        edit.wait_for(timeout=25000)
        old=float(edit.input_value())
        edit.fill(str(round(old+7,2)))
        edit.press("Tab")
        now=float(edit.input_value())
        assert abs(now-(old+7)) < 0.2,(old,now)
        nodes.get_by_role("button",name="应用节点修改").click()
        modal.get_by_role("button",name="应用到字库").click()
        assert not page.get_by_role("dialog",name="字符编辑器").is_visible()
        return f"{c}: anchor x changed {old} -> {now}, applied to local glyph"
    check("real glyph editor + Bézier anchor change + apply",node_edit)

    def export_type(fmt):
        # Run on actual preview site, no remote state mutation.
        page.get_by_role("button",name="在线试字").click()
        page.get_by_role("button",name="导出字体").click()
        dialog=page.get_by_role("dialog",name="导出字体")
        dialog.wait_for(timeout=30000)
        with page.expect_download(timeout=180000) as d:
            dialog.get_by_role("button",name=re.compile(r"\b"+fmt.upper()+r"\b")).click()
        download=d.value
        name=download.suggested_filename
        assert name.lower().endswith("."+fmt),name
        dest=Path("/tmp")/("fontreal-preview-e2e-"+fmt+"."+fmt)
        download.save_as(dest)
        result=font_valid(dest,fmt,"字")
        return f"{name} ({dest.stat().st_size} bytes), {result}"
    check("real UI TTF export and downloaded font validity",lambda: export_type("ttf"))
    check("real UI OTF export and downloaded font validity",lambda: export_type("otf"))

    if bad:
        try:page.screenshot(path="/tmp/fontreal-preview-e2e.png",full_page=True,timeout=10000)
        except Exception as e: print("Screenshot unavailable:",str(e)[:120])
    context.close()
    browser.close()
print("\n=== FINAL RESULT ===")
print("PASS",len(ok),"/",len(ok)+len(bad))
for name in ok:print("  OK",name)
for name,why in bad:print("  FAILED",name,repr(why))
print("AI actual generation NOT CALLED (would consume API credits).")
print("No production or bearbox8 changes.")
sys.exit(1 if bad else 0)
