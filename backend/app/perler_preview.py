"""Deterministic PNG display for mobile: no CSS cell wrapping or tiny text."""
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont


def render_perler_preview(result: dict[str, object], *, chart: bool = False) -> bytes:
    size = int(result["size"])
    cell_size, margin = 24, 28
    image = Image.new("RGB", (size * cell_size + margin * 2,) * 2, "#F6F7F9")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=9)
    coordinates = ImageFont.load_default(size=10)
    color_codes = {color["hex"]: color["id"] for color in result["colors"]}
    for y in range(size):
        for x in range(size):
            cell = result["cells"][y * size + x]
            left, top = margin + x * cell_size, margin + y * cell_size
            if cell["empty"]:
                continue
            color = cell["color"]
            if chart:
                draw.rectangle((left, top, left + 23, top + 23), fill=color)
                rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
                text_color = "#151719" if sum(a * b for a, b in zip(rgb, (0.299, 0.587, 0.114))) > 145 else "#FFFFFF"
                draw.text((left + 12, top + 12), color_codes[color], font=font, fill=text_color, anchor="mm")
            else:
                # Mobile thumbnail is for judging the pattern, not bead hardware:
                # rings used only ~54% of each cell and washed out pale line art.
                draw.rectangle((left, top, left + 23, top + 23), fill=color)
    if chart:
        for index in range(size + 1):
            position = margin + index * cell_size
            strong = index % 8 == 0 or index == size
            shade = "#92999F" if strong else "#D6DADF"
            width = 2 if strong else 1
            draw.line((position, margin, position, margin + size * cell_size), fill=shade, width=width)
            draw.line((margin, position, margin + size * cell_size, position), fill=shade, width=width)
            if index < size:
                draw.text((position + 12, 14), str(index + 1), fill="#61676B", font=coordinates, anchor="mm")
                draw.text((14, position + 12), str(index + 1), fill="#61676B", font=coordinates, anchor="mm")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
