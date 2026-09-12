"""In-memory HTTP smoke test; uses a synthetic scene, not a phone QA claim."""
import argparse
import base64
import json
from urllib.request import Request, urlopen

import cv2
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    base = parser.parse_args().base_url.rstrip('/')
    image = np.full((800, 1200, 3), (35, 170, 40), np.uint8)
    image[200:600, 350:850] = (25, 30, 220)
    image[300:400, 450:550:2] = (55, 45, 245)
    _, encoded = cv2.imencode('.png', image)

    def segment(stage: str, prompt: dict | None = None) -> dict:
        boundary = 'world-clipboard-smoke-boundary'
        fields = {'pointX': '.5', 'pointY': '.5', 'mode': 'object', 'stage': stage, 'debug': 'true'}
        if prompt:
            fields['prompt'] = json.dumps(prompt)
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode() for key, value in fields.items()]
        parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n'.encode(), encoded.tobytes(), f'\r\n--{boundary}--\r\n'.encode()]
        request = Request(base + '/api/segment', data=b''.join(parts), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        with urlopen(request, timeout=15) as response:
            return json.load(response)

    selected = segment('selection')
    assert selected['outline'].startswith('data:image/png;base64,')
    result = segment('final', {'positivePoints': [{'x': .5, 'y': .5}], 'negativePoints': [], 'box': selected['bbox']})
    mask = cv2.imdecode(np.frombuffer(base64.b64decode(result['mask'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    assert mask.shape == (800, 1200), mask.shape
    request = Request(base + '/api/perler', data=json.dumps({'image': result['preview'], 'size': 32}).encode(), headers={'Content-Type': 'application/json'})
    with urlopen(request, timeout=15) as response:
        perler = json.load(response)
    assert perler['size'] == 32 and perler['totalBeads'] > 0
    print(json.dumps({'selection': 'ok', 'final': result['debug'], 'perler': {key: value for key, value in perler.items() if key in ('size', 'width', 'height', 'beadCount', 'totalBeads', 'colorCount', 'success')}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
