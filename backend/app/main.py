import base64
import binascii
from io import BytesIO
from typing import Annotated, Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.perler import generate_perler
from app.segmentation import resize_for_segmentation, segment_foreground


MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="World Clipboard Vision API", version="0.1.0")


class PerlerRequest(BaseModel):
    image: str = Field(min_length=24, max_length=3_000_000)
    size: int = Field(default=32, ge=8, le=64)


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
                "message": "request fields must be valid",
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

    try:
        with Image.open(BytesIO(contents)) as image_metadata:
            _ensure_safe_image_dimensions(*image_metadata.size)
    except Image.DecompressionBombError as error:
        raise ApiError(413, "IMAGE_DIMENSIONS_TOO_LARGE", "decoded image is too large") from error
    except (UnidentifiedImageError, OSError) as error:
        raise ApiError(422, "INVALID_IMAGE", "uploaded bytes are not a valid image") from error

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


@app.post("/api/perler")
async def perler(request: PerlerRequest) -> dict[str, object]:
    prefix = "data:image/png;base64,"
    if not request.image.startswith(prefix):
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler input must be a PNG data URL")

    try:
        contents = base64.b64decode(request.image[len(prefix) :], validate=True)
    except (binascii.Error, ValueError) as error:
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler image base64 is invalid") from error

    image = cv2.imdecode(np.frombuffer(contents, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim != 3 or image.shape[2] != 4:
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler input must contain transparency")

    try:
        return generate_perler(image, request.size)
    except ValueError as error:
        raise ApiError(422, "PERLER_GENERATION_FAILED", str(error)) from error


def _png_data_url(image: np.ndarray) -> str:
    encoded, buffer = cv2.imencode(".png", image)
    if not encoded:
        raise ApiError(500, "ENCODE_FAILED", "could not encode segmentation result")
    payload = base64.b64encode(buffer.tobytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def _ensure_safe_image_dimensions(width: int, height: int) -> None:
    if width * height > MAX_IMAGE_PIXELS:
        raise ApiError(
            413,
            "IMAGE_DIMENSIONS_TOO_LARGE",
            "decoded image must not exceed 20 megapixels",
        )
