"""Local converter CLI for server-side AI/EPS/SVG/TTF/OTF outline extraction.
Only run as a locked-down subprocess. No user-provided shell commands.
"""
import json,sys
from glyph_editor import import_artwork
if __name__=='__main__':
    try:
        ext=sys.argv[1]
        char=sys.argv[2]
        size=0
        chunks=[]
        while True:
            p=sys.stdin.buffer.read(65536)
            if not p:break
            size+=len(p)
            if size>15*1024*1024:raise ValueError('上传文件不得超过 15 MB')
            chunks.append(p)
        result=import_artwork(b''.join(chunks),'reference'+ext,char=char)
        print(json.dumps({'ok':True,**result},ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))
        sys.exit(2)
