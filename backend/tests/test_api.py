import base64

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app


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
