from PIL import Image, ImageDraw

from .common import make_grid, grid_result, png_url


def generate_cross_stitch(image, *, size=48, max_colors=16):
    grid = make_grid(image, size, max_colors, 'T')
    result = grid_result('cross-stitch', '十字绣针位模板', grid, '针', '通用绣线近似色 · 非官方 DMC 色号')
    stitched = Image.new('RGB', (size * 24,) * 2, '#FAF8F2')
    draw = ImageDraw.Draw(stitched)
    for index, cell in enumerate(grid['cells']):
        if cell['empty']:
            continue
        x, y = (index % size) * 24, (index // size) * 24
        draw.line((x + 3, y + 3, x + 21, y + 21), fill=cell['color'], width=7)
        draw.line((x + 21, y + 3, x + 3, y + 21), fill=cell['color'], width=7)
    result.update(previewImage=png_url(stitched), previewLabel='绣制预览', chartLabel='针位色号图',
                  exportImage=result['chartImage'], exportLabel='针位图纸 PNG')
    centimeters = size / 14 * 2.54
    result['metrics'].append({'label': '14CT 全网格', 'value': f'{centimeters:.1f} × {centimeters:.1f} cm'})
    result['notes'] = ['一格是一针完整十字；透明位置不绣，T 色号仅用于本图配色。',
                       '14CT 尺寸按每英寸 14 格估算，包含网格空边；裁布需另留装裱边。',
                       '不提供真实耗线长度；实际绣线颜色需用实物核对。']
    return result
