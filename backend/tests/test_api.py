import base64
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from app.main import ApiError, _ensure_safe_image_dimensions, app


client = TestClient(app)


def test_contour_mode_returns_silhouette_instead_of_colored_cutout() -> None:
    frame = np.full((100, 140, 3), (30, 160, 30), np.uint8)
    frame[25:75, 40:100] = (20, 20, 230)
    _, encoded = cv2.imencode('.png', frame)
    previews = {}
    for mode in ('object', 'contour'):
        response = client.post('/api/segment',
            files={'image': ('frame.png', encoded.tobytes(), 'image/png')},
            data={'pointX': '.5', 'pointY': '.5', 'mode': mode})
        assert response.status_code == 200
        payload = response.json()
        previews[mode] = cv2.imdecode(np.frombuffer(
            base64.b64decode(payload['preview'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
        if mode == 'contour':
            assert 3 <= len(payload['contour']) <= 1024
            assert all(0 <= v <= 1 for p in payload['contour'] for v in p)
        else:
            assert 'contour' not in payload
    assert np.array_equal(previews['object'][:, :, 3], previews['contour'][:, :, 3])
    assert np.all(previews['object'][:, :, :3] == (20, 20, 230))
    assert np.all(previews['contour'][:, :, :3] == 17)


def test_selection_returns_a_real_outline_and_validates_final_prompt() -> None:
    frame = np.full((100, 140, 3), (30, 160, 30), np.uint8)
    frame[25:75, 40:100] = (20, 20, 230)
    _, encoded = cv2.imencode('.png', frame)
    upload = {'image': ('frame.png', encoded.tobytes(), 'image/png')}
    fields = {'pointX': '.5', 'pointY': '.5', 'mode': 'object', 'stage': 'selection'}
    response = client.post('/api/segment', files=upload, data=fields)
    assert response.status_code == 200
    outline = cv2.imdecode(np.frombuffer(base64.b64decode(response.json()['outline'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    assert outline.shape == (100, 140, 4)
    assert np.count_nonzero(outline[:, :, 3]) > 0
    fields.update(stage='final', prompt='{"positivePoints":[{"x":0.1,"y":0.5}]}')
    rejected = client.post('/api/segment', files=upload, data=fields)
    assert rejected.status_code == 422
    assert rejected.json()['error']['code'] == 'INVALID_PROMPT'
    fields['prompt'] = '{"box":{"x":0.8,"y":0.2,"width":0.5,"height":0.3}}'
    assert client.post('/api/segment', files=upload, data=fields).status_code == 422


def test_blurry_final_photo_returns_a_retryable_code() -> None:
    frame = np.full((600, 1000, 3), (30, 160, 30), np.uint8)
    frame[180:420, 300:700] = (20, 20, 230)
    frame = cv2.GaussianBlur(frame, (51, 51), 12)
    _, encoded = cv2.imencode('.png', frame)
    response = client.post('/api/segment', files={'image': ('blur.png', encoded.tobytes(), 'image/png')},
        data={'pointX': '.5', 'pointY': '.5', 'mode': 'object'})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'BLURRY_CAPTURE'


def test_final_segment_retains_original_rgb_and_mask_resolution() -> None:
    image = np.full((600, 1000, 3), (30, 160, 30), dtype=np.uint8)
    image[180:420, 300:700] = (20, 20, 230)
    image[250:350, 400:600:2] = (25, 25, 235)
    _, encoded = cv2.imencode('.png', image)
    response = client.post('/api/segment', files={'image': ('high.png', encoded.tobytes(), 'image/png')},
                           data={'pointX': '0.5', 'pointY': '0.5', 'mode': 'object'})
    assert response.status_code == 200
    payload = response.json()
    mask = cv2.imdecode(np.frombuffer(base64.b64decode(payload['mask'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    preview = cv2.imdecode(np.frombuffer(base64.b64decode(payload['preview'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    assert mask.shape == (600, 1000)
    assert preview.shape[1] >= 390
    x, y = round(payload['bbox']['x'] * 1000), round(payload['bbox']['y'] * 600)
    assert np.array_equal(preview[:, :, :3], image[y:y+preview.shape[0], x:x+preview.shape[1]])


def test_camera_jpeg_is_decoded_in_exif_display_orientation() -> None:
    # Frontend maps to oriented dimensions, matching IMREAD_COLOR in /segment.
    source = Image.new("RGB", (100, 60), (30, 160, 30))
    exif = source.getexif()
    exif[274] = 6
    buffer = BytesIO()
    source.save(buffer, format="JPEG", exif=exif)
    decoded = cv2.imdecode(np.frombuffer(buffer.getvalue(), dtype=np.uint8), cv2.IMREAD_COLOR)
    assert decoded.shape[:2] == (100, 60)


def test_health_reports_ready() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "segmenter": "opencv-grabcut"}


def test_segment_accepts_multipart_image_and_returns_png_data_urls() -> None:
    image = np.zeros((80, 100, 3), dtype=np.uint8)
    image[:] = (30, 160, 30)
    cv2.rectangle(image, (30, 20), (69, 59), (20, 20, 230), thickness=-1)
    encoded, buffer = cv2.imencode(".png", image)
    assert encoded

    response = client.post(
        "/api/segment",
        files={"image": ("frame.png", buffer.tobytes(), "image/png")},
        data={"pointX": "0.5", "pointY": "0.5", "mode": "object"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["preview"].startswith("data:image/png;base64,")
    assert payload["mask"].startswith("data:image/png;base64,")
    assert payload["bbox"] == {"x": 0.3, "y": 0.25, "width": 0.4, "height": 0.5}
    assert len(base64.b64decode(payload["preview"].split(",", 1)[1])) > 100


def test_segment_accepts_wechat_temporary_files_with_generic_mime() -> None:
    image = np.zeros((80, 100, 3), dtype=np.uint8)
    image[:] = (30, 160, 30)
    cv2.rectangle(image, (30, 20), (69, 59), (20, 20, 230), thickness=-1)
    encoded, buffer = cv2.imencode(".jpg", image)
    assert encoded

    response = client.post(
        "/api/segment",
        files={"image": ("camera-frame", buffer.tobytes(), "application/octet-stream")},
        data={"pointX": "0.5", "pointY": "0.5", "mode": "object"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_segment_still_rejects_invalid_bytes_with_generic_mime() -> None:
    response = client.post(
        "/api/segment",
        files={"image": ("camera-frame", b"not an image", "application/octet-stream")},
        data={"pointX": "0.5", "pointY": "0.5", "mode": "object"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_segment_rejects_non_image_uploads_with_structured_error() -> None:
    response = client.post(
        "/api/segment",
        files={"image": ("frame.txt", b"not an image", "text/plain")},
        data={"pointX": "0.5", "pointY": "0.5", "mode": "object"},
    )

    assert response.status_code == 415
    assert response.json() == {
        "error": {"code": "UNSUPPORTED_MEDIA_TYPE", "message": "image must be JPEG, PNG or WebP"}
    }


def test_segment_rejects_invalid_coordinates_with_structured_error() -> None:
    response = client.post(
        "/api/segment",
        files={"image": ("frame.jpg", b"not decoded", "image/jpeg")},
        data={"pointX": "1.4", "pointY": "0.5", "mode": "object"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_image_dimension_guard_rejects_decompression_bombs() -> None:
    try:
        _ensure_safe_image_dimensions(5000, 5000)
    except ApiError as error:
        assert error.status_code == 413
        assert error.code == "IMAGE_DIMENSIONS_TOO_LARGE"
    else:
        raise AssertionError("expected excessive image dimensions to be rejected")


def test_perler_accepts_transparent_png_and_returns_real_grid() -> None:
    image = np.zeros((20, 40, 4), dtype=np.uint8)
    image[5:15, 5:35] = (40, 40, 220, 255)
    encoded, buffer = cv2.imencode(".png", image)
    assert encoded
    data_url = "data:image/png;base64," + base64.b64encode(buffer.tobytes()).decode("ascii")

    response = client.post("/api/perler", json={"image": data_url, "size": 8})

    assert response.status_code == 200
    payload = response.json()
    assert payload["size"] == 8
    assert len(payload["cells"]) == 64
    assert payload["totalBeads"] == 12
    assert payload["colors"][0]["name"] == "正红"


def test_perler_rejects_non_png_payloads() -> None:
    response = client.post(
        "/api/perler",
        json={"image": "data:text/plain;base64,bm90LWltYWdl", "size": 32},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_PERLER_IMAGE"


def test_perler_quality_api_returns_mard_codes_and_zoomable_pngs() -> None:
    image = np.zeros((28, 28, 4), dtype=np.uint8)
    image[3:25, 8:20] = (34, 0, 211, 255)
    _, buffer = cv2.imencode(".png", image)
    response = client.post("/api/perler", json={
        "image": "data:image/png;base64," + base64.b64encode(buffer).decode("ascii"),
        "size": 48, "palette": "mard221", "style": "cartoon", "maxColors": 8,
        "includePreviews": True,
    })
    assert response.status_code == 200
    payload = response.json()
    assert payload["paletteId"] == "mard221"
    assert payload["paletteSize"] == 221
    assert payload["colors"][0]["id"] == "F15"
    for field in ("beadPreview", "chartPreview"):
        data = base64.b64decode(payload[field].split(",", 1)[1], validate=True)
        decoded = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        assert decoded.shape[:2] == (48 * 24 + 56, 48 * 24 + 56)


def test_perler_quality_api_validates_options_before_decoding() -> None:
    for options in ({"palette": "unknown"}, {"style": "unknown"}, {"maxColors": 1}, {"maxColors": 65}):
        response = client.post("/api/perler", json={"image": "data:image/png;base64,AAAA", **options})
        assert response.status_code == 422
