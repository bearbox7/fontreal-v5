"""Import glyph artwork and compile saved outline edits into installable TTF / CFF OTF.

Single artwork -> one glyph. Does not hallucinate missing GB2312 glyphs.
"""
from __future__ import annotations

import io
import json
import math
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

import cv2
import numpy as np
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import SVGPath, parse_path
from fontTools.svgLib.path.shapes import PathBuilder
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont
from font_compiler import CompileResult, selected_codepoints, sanitize_name, ps_name

MAX_SOURCE = 15 * 1024 * 1024
MAX_PATHS = 300
MAX_GLYPHS = 7445


def _rec_to_svg(recorder: RecordingPen, padding: int = 75) -> list[str]:
    bounds = BoundsPen(None)
    recorder.replay(bounds)
    if not bounds.bounds:
        raise ValueError('没有提取到有效的字形轮廓；请先将文字转为路径/轮廓。')
    x0, y0, x1, y1 = bounds.bounds
    if x1 <= x0 or y1 <= y0:
        raise ValueError('字形轮廓尺寸无效。')
    scale = min((1000 - 2 * padding) / (x1 - x0), (1000 - 2 * padding) / (y1 - y0))
    ox = (1000 - (x1 - x0) * scale) / 2 - x0 * scale
    oy = (1000 - (y1 - y0) * scale) / 2 + y1 * scale
    pen = SVGPathPen(None)
    recorder.replay(TransformPen(pen, (scale, 0, 0, -scale, ox, oy)))
    d = pen.getCommands()
    if not d:
        raise ValueError('轮廓为空。')
    # return separate subpaths (subpath M commands are the only valid initial commands)
    result = re.findall(r'M(?:(?!M).)*', d, re.S)
    return [s for s in result if len(s) > 2]


def _trace_raster(data: bytes, threshold: int) -> tuple[list[str], str]:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError('图片无法解码，请上传正常的 PNG 或 JPG。')
    h, w = img.shape[:2]
    if max(w, h) > 7000 or min(w, h) < 8:
        raise ValueError('建议使用 8~7000 像素的字形图片。')
    if img.ndim == 3 and img.shape[2] == 4:
        alpha = img[:, :, 3]
        if np.count_nonzero(alpha < 245) > len(alpha.flat) // 40:
            mask = np.where(alpha >= threshold, 255, 0).astype('uint8')
        else:
            gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
            mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)[1]
    # High-resolution sketches are simplified, not every source pixel becomes a node.
    mask = cv2.copyMakeBorder(mask, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=0)
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        raise ValueError('图片里没有识别到足够清晰的深色字形；建议使用白底黑字图片。')
    h0, w0 = mask.shape
    min_area = max(4., w0 * h0 * 0.000018)
    keep = [(idx, c) for idx, c in enumerate(contours) if abs(cv2.contourArea(c)) >= min_area]
    if len(keep) > MAX_PATHS:
        raise ValueError(f'路径数量过多（{len(keep)} 条），请提高阈值或简化图片。')
    if not keep:
        raise ValueError('没有足够大的有效轮廓。')
    pts = np.concatenate([c[:,0,:] for _,c in keep],axis=0)
    x0, y0 = np.min(pts, axis=0)
    x1, y1 = np.max(pts, axis=0)
    scale = 850 / max(float(x1-x0),float(y1-y0),1)
    ox=(1000-(x1-x0)*scale)/2
    oy=(1000-(y1-y0)*scale)/2
    paths = []
    kept = {i for i,_ in keep}
    for idx, cnt in keep:
        # Approximate each contour; preserve holes by even-odd nesting and opposite direction.
        epsilon = max(.7, cv2.arcLength(cnt, True) * .00065)
        simple = cv2.approxPolyDP(cnt, epsilon, True)[:,0,:]
        if len(simple) < 3:
            continue
        parent = hierarchy[0][idx][3]
        depth = 0
        while parent != -1:
            if parent in kept:
                depth += 1
            parent = hierarchy[0][parent][3]
        coords = [(round((float(x)-x0)*scale+ox,2),round((float(y)-y0)*scale+oy,2)) for x,y in simple]
        # OpenCV external contours are clockwise in image coordinates, holes anticlockwise.
        signed = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(coords,coords[1:]+coords[:1]))
        if (signed < 0) == (depth % 2 == 0):
            coords.reverse()
        paths.append('M' + f'{coords[0][0]} {coords[0][1]}' + ''.join(f'L{x} {y}' for x,y in coords[1:]) + 'Z')
    if not paths:
        raise ValueError('矢量化轮廓为空。')
    return paths, f'已将图片阈值化并描摹为 {len(paths)} 条闭合轮廓；细节可能需要手动修整。'


def _svg_matrix(text: str) -> Transform:
    out = Transform()
    for kind, raw in re.findall(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)', text or ''):
        vals = [float(v) for v in re.split(r'[\s,]+',raw.strip()) if v]
        if kind=='matrix' and len(vals)==6: m=Transform(*vals)
        elif kind=='translate' and len(vals) in (1,2):m=Transform(1,0,0,1,vals[0],vals[1] if len(vals)==2 else 0)
        elif kind=='scale' and len(vals) in (1,2):m=Transform(vals[0],0,0,vals[1] if len(vals)==2 else vals[0],0,0)
        elif kind=='rotate' and len(vals) in (1,3):
            rad=math.radians(vals[0]); co=math.cos(rad);si=math.sin(rad)
            m=Transform(co,si,-si,co,0,0)
            if len(vals)==3:m=Transform(1,0,0,1,vals[1],vals[2]).transform(m).transform(Transform(1,0,0,1,-vals[1],-vals[2]))
        elif kind=='skewX' and len(vals)==1:m=Transform(1,0,math.tan(math.radians(vals[0])),1,0,0)
        elif kind=='skewY' and len(vals)==1:m=Transform(1,math.tan(math.radians(vals[0])),0,1,0,0)
        else:raise ValueError('SVG 变换参数无效，请先扩展图层。')
        out=out.transform(m)
    return out


def _svg_recording(data: bytes) -> RecordingPen:
    """Preserve true vector curves and nested group transforms (SVGPath alone misses groups)."""
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('SVG 不允许包含 DTD 或实体声明。')
    root=ElementTree.fromstring(data)
    pen=RecordingPen()
    allowed={'path','rect','circle','ellipse','polygon','polyline'}
    banned={'defs','clipPath','mask','symbol','pattern'}
    def visit(el, parent: Transform, hidden=False, fill='black'):
        name=el.tag.rsplit('}',1)[-1] if isinstance(el.tag,str) else ''
        if name in banned:return
        attr=el.attrib
        css={m.group(1).strip():m.group(2).strip() for m in re.finditer(r'([^:;]+):([^;]+)',attr.get('style',''))}
        visibility=css.get('display',attr.get('display',''))
        current_hidden=hidden or visibility=='none' or css.get('visibility',attr.get('visibility',''))=='hidden'
        current_fill=css.get('fill',attr.get('fill',fill)).lower().replace(' ','')
        if not current_hidden:
            combined=parent.transform(_svg_matrix(attr.get('transform','')))
            if name in allowed and current_fill not in ('none','transparent','white','#fff','#ffffff','rgb(255,255,255)'):
                pb=PathBuilder()
                pb.add_path_from_element(el)
                for d in pb.paths:
                    parse_path(d,TransformPen(pen,combined))
            for child in el:visit(child,combined,current_hidden,current_fill)
    visit(root,Transform())
    return pen


def _to_svg_via_inkscape(data: bytes, suffix: str) -> bytes:
    # This executes native converters: isolate service in a sandbox for public internet use.
    with tempfile.TemporaryDirectory(prefix='zijing-import-') as temp:
        source = Path(temp) / ('input' + suffix)
        dest = Path(temp) / 'converted.svg'
        source.write_bytes(data)
        if suffix.lower()=='.eps':
            pdf=Path(temp)/'converted.eps.pdf'
            try:
                proc=subprocess.run(['gs','-q','-dSAFER','-dBATCH','-dNOPAUSE','-dEPSCrop','-sDEVICE=pdfwrite',f'-sOutputFile={pdf}',str(source)],capture_output=True,text=True,timeout=20,cwd=temp)
            except (FileNotFoundError,subprocess.TimeoutExpired) as e:
                raise ValueError('EPS 转 PDF 需要 Ghostscript，或先导出 SVG。') from e
            if proc.returncode or not pdf.exists() or pdf.stat().st_size>15*1024*1024:
                raise ValueError('EPS 文件无法安全转换，请先在 AI 中转曲并另存 SVG。')
            source=pdf
        try:
            process = subprocess.run(
                ['inkscape', str(source), '--export-text-to-path', '--export-plain-svg', f'--export-filename={dest}'],
                capture_output=True, text=True, timeout=25, cwd=temp,
                env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':temp,'XDG_CONFIG_HOME':temp,'XDG_CACHE_HOME':temp},
            )
        except FileNotFoundError as e:
            raise ValueError('AI/EPS 导入需要服务器安装 Inkscape 和 Ghostscript。') from e
        except subprocess.TimeoutExpired as e:
            raise ValueError('AI/EPS 转换超时，请先在 Illustrator 中转曲并保存为 SVG。') from e
        if process.returncode != 0 or not dest.exists():
            raise ValueError('未能转换 AI/EPS：请将文字转曲，AI 另存 PDF 兼容格式，或导出 SVG 再试。')
        if dest.stat().st_size > 8 * 1024 * 1024:
            raise ValueError('转换后的 SVG 太大，请简化图层和节点。')
        return dest.read_bytes()


def import_artwork(data: bytes, filename: str, threshold: int = 165, char: str = '永') -> dict:
    if not (0 < len(data) <= MAX_SOURCE):
        raise ValueError('源文件大小必须在 1 字节到 15 MB 之间。')
    if len(char) != 1 or 0xD800 <= ord(char) <= 0xDFFF:
        raise ValueError('一次仅能将一张参考图指定为一个 Unicode 字符。')
    if not 1 <= threshold <= 254:
        raise ValueError('阈值须为 1 至 254。')
    extension = Path(filename).suffix.lower()
    if extension in ('.jpg','.jpeg','.png'):
        paths, note = _trace_raster(data, threshold)
        origin = 'raster-traced'
    elif extension in ('.svg','.eps','.ai','.ttf','.otf'):
        if extension in ('.ttf','.otf'):
            try:
                source = TTFont(io.BytesIO(data))
                cmap = source.getBestCmap() or {}
                if ord(char) not in cmap:
                    raise ValueError(f'上传的字体没有「{char}」字形。')
                glyph_set = source.getGlyphSet()
                recorder = DecomposingRecordingPen(glyph_set)
                glyph_set[cmap[ord(char)]].draw(recorder)
                paths = _rec_to_svg(recorder)
                source.close()
            except ValueError:
                raise
            except Exception as e:
                raise ValueError('TTF/OTF 字形无法读取。') from e
            note = '已提取指定字符的矢量轮廓，可修改节点后覆盖原字体字形。'
            origin = 'font-outline'
        else:
            if extension == '.ai':
                if data.startswith(b'%PDF'):
                    data = _to_svg_via_inkscape(data, '.pdf')
                    note='已从 PDF 兼容 AI 转换为路径；复杂效果可能有偏差。'
                elif data.startswith(b'%!PS'):
                    data = _to_svg_via_inkscape(data, '.eps')
                    note='已从旧式 PostScript AI 转换为路径；复杂效果可能有偏差。'
                else:
                    raise ValueError('此 AI 不含可识别的 PDF/PS 数据；请另存为 PDF 兼容 AI 或 SVG。')
            elif extension == '.eps':
                if not data.startswith(b'%!PS'):
                    raise ValueError('EPS 文件头无效。')
                data = _to_svg_via_inkscape(data, '.eps')
                note='已通过 Inkscape/Ghostscript 转为 SVG；复杂效果可能有偏差。'
            else:
                note='SVG 矢量路径已保留；外链图像、未转曲文字、滤镜不属于字体轮廓。'
            if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                raise ValueError('SVG 不允许包含 DTD 或实体声明。')
            try:
                recorder = _svg_recording(data)
                paths = _rec_to_svg(recorder)
            except ValueError:
                raise
            except Exception as e:
                raise ValueError('无法解析 SVG 路径，请先在设计软件中扩展外观并将文字转为轮廓。') from e
            origin='vector-outline'
    else:
        raise ValueError('支持 PNG、JPG、SVG、EPS、PDF 兼容 AI、TTF 和 OTF 文件。')
    if len(paths)>MAX_PATHS or sum(map(len,paths))>1_500_000:
        raise ValueError('轮廓复杂度过高，请减少路径或节点。')
    return {'char':char,'paths':paths,'path_count':len(paths),'source':extension,'origin':origin,'note':note}


def _default_notdef():
    return ['M120 120L880 120L880 880L120 880Z', 'M210 210L210 790L790 790L790 210Z']


def _make_font(glyph_records: dict[int,list[str]], source_font: TTFont | None, fmt: str, family: str):
    if source_font is not None:
        source_upm = source_font['head'].unitsPerEm
        source_cmap = source_font.getBestCmap() or {}
        source_set = source_font.getGlyphSet()
        source_metrics = source_font['hmtx'].metrics
        src_scale = 1000/source_upm
    else:
        source_cmap={};source_set=None;source_metrics={};src_scale=1
    is_ttf = fmt=='ttf'
    order=['.notdef'] + [f'uni{cp:06X}' for cp in glyph_records]
    cmap={cp:f'uni{cp:06X}' for cp in glyph_records}
    shapes={}; charstrings={}; metrics={}
    for cp in [None,*glyph_records]:
        key='.notdef' if cp is None else f'uni{cp:06X}'
        recorder=RecordingPen()
        if (cp is not None and glyph_records[cp] is not None) or (cp is None and not (source_set and '.notdef' in source_set)):
            paths=_default_notdef() if cp is None else glyph_records[cp]
            for path in paths:
                pen=TransformPen(recorder,(1,0,0,-1,0,900))
                parse_path(path,pen)
            metrics[key]=(1000 if cp is None or cp > 0x2E80 else 600, 0)
        elif source_set is not None:
            old_name='.notdef' if cp is None else source_cmap[cp]
            original=DecomposingRecordingPen(source_set)
            source_set[old_name].draw(original)
            original.replay(TransformPen(recorder,(src_scale,0,0,src_scale,0,0)))
            advance,lsb=source_metrics.get(old_name,(source_upm,0))
            metrics[key]=(round(advance*src_scale),round(lsb*src_scale))
        if is_ttf:
            base = TTGlyphPen(None)
            recorder.replay(Cu2QuPen(base,max_err=1.,reverse_direction=False))
            shapes[key]=base.glyph()
        else:
            base = T2CharStringPen(width=None,glyphSet=None)
            recorder.replay(Qu2CuPen(base,max_err=1.,all_cubic=True))
            charstrings[key]=base.getCharString(private=None,globalSubrs=None)
    fb=FontBuilder(1000,isTTF=is_ttf)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    if is_ttf:fb.setupGlyf(shapes)
    else:fb.setupCFF(ps_name(family),{'FullName':ps_name(family),'FamilyName':ps_name(family),'Weight':'Regular'},charstrings,{})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900,descent=-100,lineGap=0)
    fb.setupNameTable({'familyName':family,'styleName':'Regular','uniqueFontIdentifier':ps_name(family)+':3.0','fullName':family+' Regular','psName':ps_name(family),'version':'Version 3.000','copyright':'Artwork provided and edited by the user. Verify original source licenses.'})
    fb.setupOS2(sTypoAscender=900,sTypoDescender=-100,usWinAscent=900,usWinDescent=100,usWeightClass=400)
    fb.setupPost(keepGlyphNames=True)
    fb.setupMaxp()
    out=io.BytesIO();fb.save(out)
    # Read back binary to validate it actually contains glyph mappings.
    result=out.getvalue();check=TTFont(io.BytesIO(result))
    assert set(cmap)==set(check.getBestCmap() or {}), 'cmap validation failed'
    assert check.sfntVersion==('OTTO' if fmt=='otf' else '\x00\x01\x00\x00')
    check.close()
    return result


def compile_glyph_project(project: dict, *, source_bytes: bytes | None = None, source_name: str = '') -> CompileResult:
    if not isinstance(project,dict):raise ValueError('项目数据不正确。')
    family=sanitize_name(str(project.get('family') or '字境原创字体'))
    formats=project.get('formats', ['ttf','otf'])
    if not isinstance(formats,list) or not formats or set(formats)-{'ttf','otf'}:
        raise ValueError('仅支持 TTF、OTF。')
    scope=project.get('scope','custom')
    custom_text=project.get('custom_text','')
    codepoints=selected_codepoints(scope,custom_text)
    target=[cp for cp in codepoints if not (32 <= cp <=126)] if scope!='custom' else list(dict.fromkeys(ord(c) for c in custom_text if not c.isspace()))
    incoming=project.get('glyphs',{})
    if not isinstance(incoming,dict) or len(incoming)>MAX_GLYPHS:
        raise ValueError('项目字形数量超过限制。')
    saved={}
    for char,paths in incoming.items():
        if not isinstance(char,str) or len(char)!=1 or not isinstance(paths,list) or not (1<=len(paths)<=MAX_PATHS):
            raise ValueError('单字字形数据格式错误。')
        if sum(len(p) if isinstance(p,str) else 0 for p in paths)>400_000:
            raise ValueError(f'「{char}」轮廓节点太多。')
        for d in paths:
            if not isinstance(d,str) or len(d)>250_000:
                raise ValueError('非法 SVG 路径数据。')
            # Validate each path with the exact parser used for font output.
            pen=RecordingPen()
            try:parse_path(d,pen)
            except Exception as e:raise ValueError(f'「{char}」路径解析失败。') from e
            if len(pen.value)>25000 or not any(cmd=='moveTo' for cmd,_ in pen.value):
                raise ValueError('字形路径为空或过于复杂。')
            for cmd,args in pen.value:
                for p in args:
                    if isinstance(p,tuple) and not all(math.isfinite(float(n)) and abs(float(n))<100000 for n in p):
                        raise ValueError('字形轮廓坐标无效。')
        saved[ord(char)]=paths
    font=None
    try:
        if source_bytes:
            if len(source_bytes)>32*1024*1024 or not source_name.lower().endswith(('.ttf','.otf')):
                raise ValueError('底库文件须是 32MB 以内的 TTF/OTF。')
            font=TTFont(io.BytesIO(source_bytes))
            if 'fvar' in font or 'CFF2' in font or not ('glyf' in font or 'CFF ' in font):
                raise ValueError('底库需要普通静态 TTF/OTF 字体。')
        source_map=font.getBestCmap() if font else {}
        source_set=set(font.getGlyphOrder()) if font else set()
        available={cp:saved[cp] for cp in codepoints if cp in saved}
        from_base=[cp for cp in codepoints if cp not in available and cp in (source_map or {}) and source_map[cp] != '.notdef' and source_map[cp] in source_set]
        # Source glyphs appended to mapping but distinguished during drawing.
        for cp in from_base:available[cp]=None
        if not available:
            raise ValueError('尚无可输出的字形：先导入并保存一个字，或上传字体底库。')
        missing=[cp for cp in target if cp not in available]
        if project.get('strict') and missing:
            raise ValueError(f'目标范围还有 {len(missing)} 个缺字；请继续编辑或关闭完整覆盖检查。')
        # _make_font expects dict with None for source-derived outlines.
        outputs={fmt:_make_font(available,font,fmt,family) for fmt in dict.fromkeys(formats)}
    except ValueError:raise
    except Exception as exc:
        raise ValueError('字形编译失败，请检查是否存在自交、开口路径或异常节点。') from exc
    finally:
        if font:font.close()
    report={'family':family,'standard':'GB2312-1980','scope':scope,'requested':len(target),
            'covered':len(target)-len(missing),'missing':len(missing),'complete':not missing,
            'edited_glyphs':len(saved),'edited_in_output':len([cp for cp in available if cp in saved]),
            'from_base':len(from_base),'generated_glyphs':0,'output_glyphs':len(available),
            'formats':list(outputs),'note':'仅编译已保存字形和底库现有字形；未对未编辑汉字进行 AI 风格迁移或自动补字。'}
    archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as zf:
        for fmt,data in outputs.items():zf.writestr(ps_name(family)+'.'+fmt,data)
        zf.writestr('font-report.json',json.dumps(report,ensure_ascii=False,indent=2))
        zf.writestr('missing-characters.txt',''.join(map(chr,missing)) or '无缺字')
        zf.writestr('outline-project.json',json.dumps({'version':'3.0','glyphs':incoming},ensure_ascii=False,indent=1))
        zf.writestr('README.txt','ZiJing FontLab V3. Edited glyphs only; GB2312 gaps are listed in missing-characters.txt. Check source artwork licensing.\n')
    return CompileResult(content=archive.getvalue(),manifest=report)


def change_stroke_weight(paths: list[str], amount: int) -> list[str]:
    """Destructively dilate/erode rasterized paths, then trace new editable contours.

    Unlike a CSS stroke, these adjusted outlines are truly exported to TTF/OTF.
    """
    if not isinstance(paths,list) or not (1<=len(paths)<=MAX_PATHS) or not isinstance(amount,int) or not -20<=amount<=20:
        raise ValueError('请先导入字形，笔画加粗/减细范围为 ±20。')
    from html import escape
    from cairosvg import svg2png
    # Paths are not trusted markup: XML-escape their attribute payloads.
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">'
           '<path fill="black" fill-rule="nonzero" d="' + escape(''.join(paths),quote=True) + '"/></svg>')
    image=np.asarray(bytearray(svg2png(bytestring=svg.encode(),output_width=1000,output_height=1000)),dtype=np.uint8)
    img=cv2.imdecode(image,cv2.IMREAD_UNCHANGED)
    alpha=img[:,:,3] if img.ndim==3 and img.shape[2]==4 else cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    mask=np.where(alpha>100,255,0).astype('uint8')
    if amount:
        radius=abs(amount)
        kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1))
        mask=cv2.dilate(mask,kernel) if amount>0 else cv2.erode(mask,kernel)
    contours,hierarchy=cv2.findContours(mask,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:raise ValueError('笔画减细后轮廓消失，请降低数值。')
    keep=[(idx,c) for idx,c in enumerate(contours) if cv2.contourArea(c)>5]
    if not keep or len(keep)>MAX_PATHS:raise ValueError('变换后没有有效轮廓或轮廓过多。')
    kept={i for i,_ in keep}
    output=[]
    for idx,cnt in keep:
        simple=cv2.approxPolyDP(cnt,max(.65,cv2.arcLength(cnt,True)*.0007),True)[:,0,:]
        if len(simple)<3:continue
        coords=[(int(x),int(y)) for x,y in simple]
        parent=hierarchy[0][idx][3]
        depth=0
        while parent!=-1:
            if parent in kept:depth+=1
            parent=hierarchy[0][parent][3]
        signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(coords,coords[1:]+coords[:1]))
        if (signed<0)==(depth%2==0):coords.reverse()
        output.append('M'+f'{coords[0][0]} {coords[0][1]}' + ''.join('L'+f'{x} {y}' for x,y in coords[1:])+'Z')
    return output
