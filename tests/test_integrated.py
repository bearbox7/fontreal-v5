import json
import io
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'server_tools'))
import glyph_editor
from fontTools.ttLib import TTFont

class IntegrationTests(unittest.TestCase):
    def test_gb2312_complete(self):
        data=json.loads((ROOT/'public/fonts/gb2312-full.json').read_text())
        self.assertEqual([len(data[k]) for k in ('level1','level2','hanzi','symbols','all')], [3755,3008,6763,682,7445])
        self.assertEqual(len(data['records']),7445)
        for record in data['records']:
            ch=record['char']
            self.assertEqual(bytes.fromhex(record['gb']).decode('gb2312'),ch)
            self.assertEqual(record['unicode'],f'U+{ord(ch):04X}')
    def test_svg_real_outlines(self):
        svg=b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 10 L90 10 L90 90 L10 90Z"/></svg>'
        result=glyph_editor.import_artwork(svg,'test.svg',char='中')
        self.assertEqual(result['char'],'中')
        self.assertTrue(result['paths'][0].startswith('M'))
    def test_compiled_fonts_have_holes(self):
        project={
            'family':'Zijing integration test', 'scope':'custom','custom_text':'回',
            'formats':['ttf','otf'],
            'glyphs':{'回':['M100 100L900 100L900 900L100 900Z','M200 200L200 800L800 800L800 200Z']},
        }
        output=glyph_editor.compile_glyph_project(project)
        with ZipFile(io.BytesIO(output.content)) as archive:
            for path in [p for p in archive.namelist() if p.endswith(('.ttf','.otf'))]:
                font=TTFont(io.BytesIO(archive.read(path)))
                self.assertIn(ord('回'),font.getBestCmap())
                self.assertEqual(font.sfntVersion == 'OTTO',path.endswith('.otf'))
                font.close()
        self.assertEqual(output.manifest['covered'],1)
    def test_package_has_import_and_glyph_edit(self):
        editor=(ROOT/'components/studio-editor.tsx').read_text()
        studio=(ROOT/'components/studio.tsx').read_text()
        for ext in ['.svg','.ai','.eps','.ttf','.otf']:
            self.assertIn(ext,editor)
        self.assertIn('GB2312 国标字库',studio)
        self.assertIn('registerSourceFont',studio)

if __name__=='__main__':unittest.main()
