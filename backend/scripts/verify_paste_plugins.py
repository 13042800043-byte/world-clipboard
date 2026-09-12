"""LAN API + PNG smoke check; synthetic input, never a phone-quality claim."""
import argparse
import base64
from io import BytesIO
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--output-dir', default='test-results/paste-plugins')
    args = parser.parse_args()
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    image = Image.new('RGBA', (420, 600))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((85, 65, 335, 540), radius=35, fill='#D34836')
    draw.rounded_rectangle((135, 110, 285, 215), radius=20, fill=(0, 0, 0, 0))
    draw.rectangle((85, 300, 335, 410), fill='#FFE5AB')
    draw.line((120, 340, 300, 340), fill='#263A48', width=7)
    stream = BytesIO()
    image.save(stream, format='PNG')
    source = 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()
    report = []
    for kind in ('sticker', 'pixel', 'lego', 'cross-stitch'):
        request = Request(args.api_url.rstrip('/') + '/api/templates/' + kind,
                          data=json.dumps({'image': source, 'size': 48, 'maxColors': 8, 'border': 8}).encode(),
                          headers={'Content-Type': 'application/json'}, method='POST')
        started = time.perf_counter()
        with urlopen(request, timeout=15) as response:
            contents = response.read()
        round_trip_ms = round((time.perf_counter() - started) * 1000)
        result = json.loads(contents)
        assert result['kind'] == kind and 'grid' not in result
        assets = {}
        for key in ('previewImage', 'chartImage', 'exportImage'):
            png = base64.b64decode(result[key].split(',', 1)[1], validate=True)
            with Image.open(BytesIO(png)) as asset:
                assert asset.format == 'PNG'
                assets[key] = {'size': asset.size, 'mode': asset.mode}
                if key == 'exportImage' and kind in ('sticker', 'pixel'):
                    assert asset.mode == 'RGBA' and asset.getchannel('A').getextrema()[0] == 0
            (output / f'{kind}-{key}.png').write_bytes(png)
        report.append({'kind': kind, 'roundTripMs': round_trip_ms,
                       'responseBytes': len(contents), 'metrics': result['metrics'],
                       'materialCount': sum(m['count'] for m in result['materials']), 'assets': assets})
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
