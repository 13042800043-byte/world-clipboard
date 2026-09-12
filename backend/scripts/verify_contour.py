"""Check live LAN mode separation with a synthetic frame (not phone QA)."""
import argparse
import base64
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--output-dir', default='test-results/contour')
    args = parser.parse_args()
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    frame = np.full((160, 200, 3), (30, 160, 30), np.uint8)
    cv2.circle(frame, (100, 80), 45, (20, 20, 230), -1)
    _, encoded = cv2.imencode('.png', frame)
    previews = {}
    report = []
    for mode in ('object', 'contour'):
        boundary = 'world-clipboard-contour-smoke'
        parts = []
        for name, value in {'pointX': '.5', 'pointY': '.5', 'mode': mode}.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n'.encode())
        parts.extend([encoded.tobytes(), f'\r\n--{boundary}--\r\n'.encode()])
        request = Request(args.api_url.rstrip('/') + '/api/segment', data=b''.join(parts),
                          headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        started = time.perf_counter()
        with urlopen(request, timeout=10) as response:
            payload = json.load(response)
        elapsed = round((time.perf_counter() - started) * 1000)
        png = base64.b64decode(payload['preview'].split(',')[1], validate=True)
        previews[mode] = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
        assert payload['mode'] == mode
        assert (mode != 'contour' or 3 <= len(payload['contour']) <= 1024)
        (output / f'{mode}.png').write_bytes(png)
        alpha = previews[mode][:, :, 3:4].astype(float) / 255
        white_preview = (previews[mode][:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
        cv2.imwrite(str(output / f'{mode}-white-preview.png'), white_preview)
        report.append({'mode': mode, 'roundTripMs': elapsed, 'previewSize': previews[mode].shape[:2],
                       'vertices': len(payload.get('contour', []))})
    assert np.array_equal(previews['object'][:, :, 3], previews['contour'][:, :, 3])
    assert np.all(previews['contour'][:, :, :3] == 17)
    foreground = previews['object'][:, :, 3] > 0
    assert np.all(previews['object'][:, :, :3][foreground] == (20, 20, 230))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
