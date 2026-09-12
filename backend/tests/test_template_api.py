import base64
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def source_url():
    image = np.zeros((64, 64, 4), np.uint8)
    image[8:56, 16:48] = (34, 0, 211, 255)
    _, encoded = cv2.imencode('.png', image)
    return 'data:image/png;base64,' + base64.b64encode(encoded).decode()


@pytest.mark.parametrize('kind', ['sticker', 'pixel', 'lego', 'cross-stitch'])
def test_each_template_endpoint_returns_real_png_assets(kind):
    response = client.post('/api/templates/' + kind, json={'image': source_url()})
    assert response.status_code == 200
    result = response.json()
    assert result['kind'] == kind
    assert 'grid' not in result  # Internal working grid is not transport data.
    for key in ('previewImage', 'chartImage', 'exportImage'):
        assert base64.b64decode(result[key].split(',')[1]).startswith(b'\x89PNG')


@pytest.mark.parametrize('extra', [{'size': 256}, {'maxColors': 100}, {'border': 999}, {'image': 'data:image/png;base64,' + '!' * 40}])
def test_template_api_rejects_invalid_inputs(extra):
    response = client.post('/api/templates/sticker', json={'image': source_url(), **extra})
    assert response.status_code == 422
    assert 'error' in response.json()


def test_unknown_template_is_not_executed():
    response = client.post('/api/templates/unknown', json={'image': source_url()})
    assert response.status_code == 422


def test_template_api_rejects_oversize_png_before_decoding():
    response = client.post('/api/templates/sticker', json={'image': 'data:image/png;base64,' + base64.b64encode(b'x' * (5 * 1024 * 1024 + 1)).decode()})
    assert response.status_code == 413
