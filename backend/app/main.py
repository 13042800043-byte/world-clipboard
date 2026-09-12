import base64
from typing import Annotated, Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.segmentation import resize_for_segmentation, segment_foreground


MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="World Clipboard Vision API", version="0.1.0")


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message


@app.exception_handler(ApiError)
async def handle_api_error(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": error.code, "message": error.message}},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "mode and point coordinates must be valid",
            }
        },
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "segmenter": "opencv-grabcut"}


@app.post("/api/segment")
async def segment(
    image: Annotated[UploadFile, File(description="JPEG, PNG or WebP camera frame")],
    point_x: Annotated[float, Form(alias="pointX", ge=0, le=1)],
    point_y: Annotated[float, Form(alias="pointY", ge=0, le=1)],
    mode: Annotated[Literal["object", "contour"], Form()],
) -> dict[str, object]:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "image must be JPEG, PNG or WebP")

    contents = await image.read(MAX_IMAGE_BYTES + 1)
    if len(contents) > MAX_IMAGE_BYTES:
        raise ApiError(413, "IMAGE_TOO_LARGE", "image must not exceed 5 MB")

    frame = cv2.imdecode(np.frombuffer(contents, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ApiError(422, "INVALID_IMAGE", "uploaded bytes are not a valid image")
    frame = resize_for_segmentation(frame)

    try:
        result = segment_foreground(frame, (point_x, point_y))
    except ValueError as error:
        raise ApiError(422, "SEGMENTATION_FAILED", str(error)) from error

    return {
        "success": True,
        "mode": mode,
        "preview": _png_data_url(result.cutout),
        "mask": _png_data_url(result.mask),
        "bbox": result.bbox,
    }


def _png_data_url(image: np.ndarray) -> str:
    encoded, buffer = cv2.imencode(".png", image)
    if not encoded:
        raise ApiError(500, "ENCODE_FAILED", "could not encode segmentation result")
    payload = base64.b64encode(buffer.tobytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"
