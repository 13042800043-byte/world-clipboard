import cv2
import numpy as np
from PIL import Image

from .common import source_rgba, png_url, checkerboard


def generate_sticker(image: np.ndarray, *, border: int = 8) -> dict:
    if border not in (0, 8, 16):
        raise ValueError('invalid sticker border')
    source = source_rgba(image)
    source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    padding = border + 12
    canvas = Image.new('RGBA', (source.width + padding * 2, source.height + padding * 2))
    canvas.alpha_composite(source, (padding, padding))
    if border:
        alpha = np.asarray(canvas.getchannel('A'))
        outline = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (border * 2 + 1,) * 2))
        backing = Image.new('RGBA', canvas.size, '#FFFFFF')
        backing.putalpha(Image.fromarray(outline))
        canvas = Image.alpha_composite(backing, canvas)
    sheet = Image.new('RGBA', (1200, 1697), '#FFFFFF')
    copy = canvas.copy()
    copy.thumbnail((480, 480), Image.Resampling.LANCZOS)
    for row in range(3):
        for column in range(2):
            sheet.alpha_composite(copy, (column * 600 + (600 - copy.width) // 2,
                                        row * 550 + (550 - copy.height) // 2 + 24))
    return {'kind': 'sticker', 'title': '透明贴纸', 'previewImage': png_url(checkerboard(canvas)),
            'chartImage': png_url(sheet.convert('RGB')), 'exportImage': png_url(canvas),
            'previewLabel': '贴纸预览', 'chartLabel': '六枚排版', 'exportLabel': '透明贴纸 PNG',
            'paletteLabel': '保留原图颜色与细节 · 棋盘格仅用于预览',
            'metrics': [{'label': '尺寸', 'value': f'{canvas.width} × {canvas.height} px'},
                        {'label': '白边', 'value': f'{border} px'}, {'label': '排版', 'value': '6 枚'}],
            'materials': [], 'notes': ['透明 PNG 不含棋盘格；六枚排版为白底 PNG，打印尺寸需手动设置。',
                                       '白边会收紧小孔；需要保留细小透明孔时选择无白边。']}
