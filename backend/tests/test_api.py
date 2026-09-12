import base64

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import ApiError, _ensure_safe_image_dimensions, app


client = TestClient(app)


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
