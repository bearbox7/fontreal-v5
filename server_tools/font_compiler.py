"""Compile user-supplied vector outlines into installable TTF (glyf) and OTF (CFF).

GB2312 specifies the codepoints, not their outlines. Missing source outlines are never
fabricated. The returned archive records exact actual and missing coverage.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import zipfile
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.ttLib import TTFont, TTLibError

ROOT = Path(__file__).resolve().parent
GB_CSV = ROOT / "data" / "GB2312-1980-完整7445编码表.csv"


def load_gb_sets():
    groups = {'primary': [], 'secondary': [], 'symbols': []}
    with GB_CSV.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            ch = row.get('字符', '')
            category = row.get('分级', '')
            if len(ch) != 1:
                continue
            if '一级' in category:
                groups['primary'].append(ord(ch))
            elif '二级' in category:
                groups['secondary'].append(ord(ch))
            else:
                groups['symbols'].append(ord(ch))
    assert [len(groups[k]) for k in ('primary', 'secondary', 'symbols')] == [3755, 3008, 682], [len(groups[k]) for k in ('primary', 'secondary', 'symbols')]
    return groups


GB_GROUPS = load_gb_sets()


def selected_codepoints(scope: str, custom_text: str = '') -> list[int]:
    if scope == 'primary':
        chars = GB_GROUPS['primary']
    elif scope == 'secondary':
        chars = GB_GROUPS['secondary']
    elif scope == 'hanzi':
        chars = GB_GROUPS['primary'] + GB_GROUPS['secondary']
    elif scope == 'all':
        chars = GB_GROUPS['primary'] + GB_GROUPS['secondary'] + GB_GROUPS['symbols']
    elif scope == 'custom':
        chars = [ord(ch) for ch in custom_text if not ch.isspace()]
        if not chars:
            raise ValueError('自定义文字为空，请先输入需要制作的汉字。')
        if len(set(chars)) > 7445:
            raise ValueError('自定义文字上限为 7445 个不同字符。')
    else:
        raise ValueError('无效的字符范围。')
    # Always include ASCII (space, numerals and standard Latin letters) for general use.
    return list(dict.fromkeys(chars + list(range(0x20, 0x7f))))


def sanitize_name(name: str) -> str:
    value = re.sub(r'[^\w\u4e00-\u9fff-]', '', name.strip(), flags=re.UNICODE)
    return (value or '字境原创字库')[:38]


def ps_name(name: str) -> str:
    # A portable ASCII PostScript name; creates a stable, non-empty name.
    token = re.sub(r'[^A-Za-z0-9]', '', name)
    if token:
        return 'ZiJing-' + token[:45]
    return 'ZiJing-' + ''.join(f'{ord(c):x}' for c in name[:8])[:45]


@dataclass
class CompileResult:
    content: bytes
    manifest: dict


def _create_font(font: TTFont, char_map: dict[int, str], output_format: str, family: str, width: float, slant: float) -> bytes:
    source_set = font.getGlyphSet()
    upm = int(font['head'].unitsPerEm)
    output_is_ttf = output_format == 'ttf'
    hmtx = font['hmtx'].metrics
    # Keep stable source font order for expected kerning and cmap behavior.
    glyph_order = list(OrderedDict.fromkeys(['.notdef', *char_map.values()]))
    cmap = {cp: glyph_name for cp, glyph_name in char_map.items()}
    metrics = {}
    shapes = {}
    charstrings = {}
    transform = (width, 0, slant, 1, 0, 0)
    for glyph_name in glyph_order:
        old_advance, old_lsb = hmtx.get(glyph_name, (upm, 0))
        advance = max(0, min(65535, round(old_advance * width + abs(slant) * upm * 0.25)))
        metrics[glyph_name] = (advance, round(old_lsb * width))
        # Decompose composites to guarantee the transform applies identically in TTF/OTF.
        recorder = DecomposingRecordingPen(source_set)
        source_set[glyph_name].draw(recorder)
        if output_is_ttf:
            base_pen = TTGlyphPen(None)
            out_pen = Cu2QuPen(base_pen, max_err=1.0, reverse_direction=False)
            recorder.replay(TransformPen(out_pen, transform))
            shapes[glyph_name] = base_pen.glyph()
        else:
            char_pen = T2CharStringPen(width=None, glyphSet=None)
            out_pen = Qu2CuPen(char_pen, max_err=1.0, all_cubic=True)
            recorder.replay(TransformPen(out_pen, transform))
            charstrings[glyph_name] = char_pen.getCharString(private=None, globalSubrs=None)

    fb = FontBuilder(upm, isTTF=output_is_ttf)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    if output_is_ttf:
        fb.setupGlyf(shapes)
    else:
        fb.setupCFF(ps_name(family), {'FullName': ps_name(family), 'FamilyName': ps_name(family), 'Weight': 'Regular'}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    hhea = font['hhea']
    ascent = max(1, round(hhea.ascent))
    descent = min(-1, round(hhea.descent))
    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=max(0, hhea.lineGap))
    full = f'{family} Regular'
    fb.setupNameTable({
        'familyName': family,
        'styleName': 'Regular',
        'uniqueFontIdentifier': f'{ps_name(family)}:1.0',
        'fullName': full,
        'psName': ps_name(family),
        'version': 'Version 1.000',
        'copyright': 'Outline origin: user-provided source font. Check its license before redistribution.',
    })
    original_os2 = font.get('OS/2')
    typo_ascent = int(getattr(original_os2, 'sTypoAscender', ascent))
    typo_descent = int(getattr(original_os2, 'sTypoDescender', descent))
    weight_class = max(100, min(900, int(getattr(original_os2, 'usWeightClass', 400))))
    fb.setupOS2(sTypoAscender=typo_ascent, sTypoDescender=typo_descent,
                usWinAscent=max(1, int(getattr(original_os2, 'usWinAscent', ascent))),
                usWinDescent=max(1, int(getattr(original_os2, 'usWinDescent', abs(descent)))),
                usWeightClass=weight_class, sFamilyClass=0)
    fb.setupPost(keepGlyphNames=True)
    fb.setupMaxp()
    output = io.BytesIO()
    fb.save(output)
    return output.getvalue()


def compile_package(font_bytes: bytes, filename: str, *, scope='primary', custom_text='',
                    formats=('ttf', 'otf'), family='字境中文字库', width=1., slant=0.,
                    strict=False) -> CompileResult:
    if not font_bytes or len(font_bytes) > 32 * 1024 * 1024:
        raise ValueError('源字体大小必须在 1 字节到 32 MB 之间。')
    if not filename.lower().endswith(('.ttf', '.otf')):
        raise ValueError('请上传 TTF 或 OTF 格式的原始字体文件。')
    if set(formats) - {'ttf', 'otf'} or not formats:
        raise ValueError('导出格式仅支持 TTF 或 OTF。')
    if not math.isfinite(width) or not 0.75 <= width <= 1.25:
        raise ValueError('横向字形缩放仅支持 75% 到 125%。')
    if not math.isfinite(slant) or not -0.22 <= slant <= 0.22:
        raise ValueError('字形倾斜应在 -22% 到 22% 之间。')
    family = sanitize_name(family)
    codepoints = selected_codepoints(scope, custom_text)
    # Includes ASCII by design, but completeness is reported for the chosen GB2312 scope.
    requested_base = [cp for cp in codepoints if not (0x20 <= cp <= 0x7e)] if scope != 'custom' else list(dict.fromkeys(ord(ch) for ch in custom_text if not ch.isspace()))
    source_io = io.BytesIO(font_bytes)
    try:
        font = TTFont(source_io, lazy=False, recalcBBoxes=False)
        if 'fvar' in font or 'CFF2' in font:
            raise ValueError('暂不支持可变字体，请先导出普通静态 TTF / OTF 后再上传。')
        if 'glyf' not in font and 'CFF ' not in font:
            raise ValueError('源字体须包含 TrueType glyf 或 OpenType CFF 轮廓；暂不支持可变字体、彩色字体及 TTC 字体集。')
        cmap = font.getBestCmap() or {}
        glyph_names = set(font.getGlyphOrder())
        actual = {cp: cmap[cp] for cp in codepoints if cp in cmap and cmap[cp] != '.notdef' and cmap[cp] in glyph_names}
        missing = [cp for cp in requested_base if cp not in actual]
        if not actual:
            raise ValueError('源字体中找不到可制作的文字轮廓。')
        if strict and missing:
            raise ValueError(f'源字体缺少 {len(missing)} 个目标字符；关闭「必须完整覆盖」或换用覆盖更完整的字体。示例：{"".join(map(chr, missing[:20]))}')
        output_content = {}
        for ext in dict.fromkeys(formats):
            content = _create_font(font, actual, ext, family, width, slant)
            # Validate generated binary by reading back every mapped codepoint.
            checked = TTFont(io.BytesIO(content))
            got = checked.getBestCmap() or {}
            if checked.sfntVersion != ('\x00\x01\x00\x00' if ext == 'ttf' else 'OTTO'):
                raise ValueError(f'{ext.upper()} 文件格式验证失败。')
            if any(cp not in got for cp in actual):
                raise ValueError(f'{ext.upper()} 文件 cmap 写入失败。')
            output_content[ext] = content
            checked.close()
        font.close()
    except (TTLibError, KeyError, AssertionError, ValueError) as err:
        if isinstance(err, ValueError):
            raise
        raise ValueError('字体解析或转换失败，请尝试普通的非可变 TTF / OTF 字体。') from err

    report = {
        'standard': 'GB2312-1980', 'scope': scope, 'family': family,
        'source_file': Path(filename).name,
        'requested': len(requested_base), 'covered': len(requested_base) - len(missing),
        'missing': len(missing), 'complete': not missing, 'ascii_added': True,
        'width_percent': round(width * 100), 'slant_percent': round(slant * 100),
        'formats': list(output_content),
        'note': '字形继承自用户上传的字体，仅进行轮廓转换与形变；未通过 AI 生成缺失字形。字号/字距/阴影/颜色不写入字体轮廓。',
    }
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5) as zf:
        for ext, content in output_content.items():
            zf.writestr(f'{ps_name(family)}.{ext}', content)
        zf.writestr('font-report.json', json.dumps(report, ensure_ascii=False, indent=2))
        zf.writestr('missing-characters.txt', ''.join(map(chr, missing)) or '无缺失字符')
        zf.writestr('使用说明.txt', '字境 FontLab 编译字体\n\n可将 TTF/OTF 安装到操作系统或设计软件。\n生成的轮廓基于您上传的字体；请确认原字体允许修改及再分发。\nGB2312 是字符集标准，不代表字形创作。\n颜色、阴影、画布排版、字符间距不随字体文件导出。\n详细数量请查看 font-report.json。\n')
    return CompileResult(content=archive.getvalue(), manifest=report)
