from .common import make_grid, grid_result


def generate_pixel_art(image, *, size=32, max_colors=16):
    grid = make_grid(image, size, max_colors)
    result = grid_result('pixel', '像素画', grid, '像素', '221 色图像调色板 · alpha 透明保留')
    result['notes'] = ['导出为每格 16 px 的透明 PNG，使用最近邻缩放，不做模糊插值。',
                       '密纹和小字会合并；切换网格或色数后重新生成。']
    return result
