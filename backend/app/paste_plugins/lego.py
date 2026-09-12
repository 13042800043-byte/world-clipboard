from collections import Counter
from io import BytesIO
import base64

import numpy as np
from PIL import Image, ImageDraw

from app.perler_preview import render_perler_preview
from .common import make_grid, grid_result, png_url


BRICK_SHAPES = [(4, 2), (2, 4), (3, 2), (2, 3), (2, 2),
                (4, 1), (1, 4), (3, 1), (1, 3), (2, 1), (1, 2), (1, 1)]


def pack_bricks(grid: dict) -> list[dict]:
    """Greedy same-color rectangle cover. No overlaps or unsupported 3D claim."""
    size = grid['size']
    used = np.zeros((size, size), bool)
    cells = grid['cells']
    parts = []
    for y in range(size):
        for x in range(size):
            cell = cells[y * size + x]
            if used[y, x] or cell['empty']:
                continue
            for width, height in BRICK_SHAPES:
                if x + width > size or y + height > size or used[y:y + height, x:x + width].any():
                    continue
                region = [cells[cy * size + cx] for cy in range(y, y + height) for cx in range(x, x + width)]
                if all(not c['empty'] and c['color'] == cell['color'] for c in region):
                    parts.append({'x': x, 'y': y, 'width': width, 'height': height, 'color': cell['color']})
                    used[y:y + height, x:x + width] = True
                    break
    return parts


def generate_lego(image, *, size=32, max_colors=16):
    grid = make_grid(image, size, max_colors, 'L')
    result = grid_result('lego', 'LEGO 平面拼搭', grid, '凸点', '通用积木近似色 · 非官方色号 / 库存')
    parts = pack_bricks(grid)
    counts = Counter((p['color'], min(p['width'], p['height']), max(p['width'], p['height'])) for p in parts)
    color_by_hex = {c['hex']: c for c in grid['colors']}
    result['materials'] = [{'id': f"{color_by_hex[color]['id']}-{w}x{h}",
                            'name': f"{color_by_hex[color]['name']} · {w} × {h}",
                            'hex': color, 'count': count, 'unit': '块'}
                           for (color, w, h), count in counts.most_common()]
    chart = Image.open(BytesIO(render_perler_preview(grid, chart=True))).convert('RGB')
    draw = ImageDraw.Draw(chart)
    for part in parts:
        x, y, w, h = (part[k] for k in ('x', 'y', 'width', 'height'))
        draw.rectangle((28 + x * 24, 28 + y * 24, 28 + (x + w) * 24, 28 + (y + h) * 24), outline='#45494D', width=2)
    result['chartImage'] = result['exportImage'] = png_url(chart)
    pattern = Image.open(BytesIO(base64.b64decode(result['previewImage'].split(',', 1)[1]))).convert('RGB')
    draw = ImageDraw.Draw(pattern)
    for part in parts:
        x, y, w, h = (part[k] for k in ('x', 'y', 'width', 'height'))
        draw.rectangle((x * 16, y * 16, (x + w) * 16 - 1, (y + h) * 16 - 1), outline='#64696D', width=1)
        for cy in range(y, y + h):
            for cx in range(x, x + w):
                draw.ellipse((cx * 16 + 5, cy * 16 + 5, cx * 16 + 10, cy * 16 + 10), outline='#ABB0B4', width=1)
    result.update(previewImage=png_url(pattern), previewLabel='平面拼搭', chartLabel='砖块坐标图',
                  exportLabel='砖块图纸 PNG', placements=parts)
    result['metrics'][2] = {'label': '砖块', 'value': str(len(parts))}
    result['notes'] = ['这是单层二维平面模板，不是 3D 模型；底板另备。',
                       '同色格按较大规格优先合并，不保证全局最少砖数；旋转规格合并计数。',
                       'L 色号仅用于本图；实际积木颜色、规格和库存需自行核实。']
    return result
