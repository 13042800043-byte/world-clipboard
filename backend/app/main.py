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
from pydantic import BaseModel, Field, ValidationError, model_validator
from starlette.concurrency import run_in_threadpool

from app.perler import generate_perler
from app.perler_preview import render_perler_preview
from app.segmentation import resize_for_segmentation, segment_foreground
from app.final_cutout import final_cutout


MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
SEGMENTATION_MAX_SIDE = 384
# wx.uploadFile may label camera canvas exports as application/octet-stream even
# when the bytes are a valid JPEG/PNG. The payload is still decoded and checked
# below, so accepting this transport MIME does not bypass image validation.
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/octet-stream",
}

app = FastAPI(title="World Clipboard Vision API", version="0.1.0")


class PerlerRequest(BaseModel):
    image: str = Field(min_length=24, max_length=28_000_000)
    size: int = Field(default=32, ge=8, le=64)
    palette: Literal["legacy", "mard221", "mard291"] = "legacy"
    style: Literal["cartoon", "realistic"] = "realistic"
    maxColors: int = Field(default=16, ge=2, le=64)
    includePreviews: bool = False


class PromptPoint(BaseModel):
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)


class PromptBox(PromptPoint):
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)

    @model_validator(mode='after')
    def in_bounds(self):
        if self.x + self.width > 1.001 or self.y + self.height > 1.001:
            raise ValueError('box must fit the image')
        return self


class SegmentationPrompt(BaseModel):
    positivePoints: list[PromptPoint] = Field(default_factory=list, max_length=16)
    negativePoints: list[PromptPoint] = Field(default_factory=list, max_length=24)
    box: PromptBox | None = None


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
    stage: Annotated[Literal['selection', 'final'], Form()] = 'final',
    prompt: Annotated[str | None, Form(max_length=4096)] = None,
    debug: Annotated[bool, Form()] = False,
) -> dict[str, object]:
    if image.content_type not in ALLOWED_UPLOAD_TYPES:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "image must be JPEG, PNG or WebP")

    contents = await image.read(MAX_IMAGE_BYTES + 1)
    if len(contents) > MAX_IMAGE_BYTES:
        raise ApiError(413, "IMAGE_TOO_LARGE", "image must not exceed 5 MB")

    try:
        parsed_prompt = SegmentationPrompt.model_validate_json(prompt) if prompt else SegmentationPrompt()
    except ValidationError as error:
        raise ApiError(422, 'INVALID_PROMPT', 'prompt points and box must be normalized') from error
    if parsed_prompt.positivePoints:
        positive = parsed_prompt.positivePoints[0]
        if abs(positive.x-point_x) > 0.001 or abs(positive.y-point_y) > 0.001:
            raise ApiError(422, 'INVALID_PROMPT', 'positive point must match locked selection point')
    return await run_in_threadpool(_process_segment, contents, (point_x, point_y), mode, stage, parsed_prompt, debug)


def _process_segment(contents: bytes, point: tuple[float, float], mode: str, stage: str,
                     prompt: SegmentationPrompt, debug: bool) -> dict[str, object]:

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
    try:
        if stage == 'selection':
            frame = resize_for_segmentation(frame, max_side=SEGMENTATION_MAX_SIDE)
            result = segment_foreground(frame, point)
        else:
            result = final_cutout(frame, point, box=prompt.box.model_dump() if prompt.box else None,
                                  negative_points=[(p.x, p.y) for p in prompt.negativePoints])
    except (ValueError, cv2.error) as error:
        if 'BLURRY_CAPTURE' in str(error):
            raise ApiError(422, 'BLURRY_CAPTURE', '画面模糊，请保持手机与物体稳定') from error
        raise ApiError(422, "SEGMENTATION_FAILED", '所选位置未找到完整主体，请重新对准物体内部') from error

    payload = {
        "success": True,
        "mode": mode,
        "preview": _png_data_url(result.cutout),
        "mask": _png_data_url(result.mask),
        "bbox": result.bbox,
    }
    if stage == 'selection':
        outline = np.zeros((*result.mask.shape, 4), np.uint8)
        contours, _ = cv2.findContours(result.mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(outline, contours, -1, (255, 255, 255, 255), 2)
        payload['outline'] = _png_data_url(outline)
    if debug and result.debug:
        payload['debug'] = result.debug
    return payload


@app.post("/api/perler")
def perler(request: PerlerRequest) -> dict[str, object]:
    prefix = "data:image/png;base64,"
    if not request.image.startswith(prefix):
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler input must be a PNG data URL")

    try:
        contents = base64.b64decode(request.image[len(prefix) :], validate=True)
    except (binascii.Error, ValueError) as error:
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler image base64 is invalid") from error

    try:
        with Image.open(BytesIO(contents)) as image_metadata:
            if image_metadata.format != "PNG":
                raise ApiError(422, "INVALID_PERLER_IMAGE", "perler input must be a PNG")
            _ensure_safe_image_dimensions(*image_metadata.size)
    except Image.DecompressionBombError as error:
        raise ApiError(413, "IMAGE_DIMENSIONS_TOO_LARGE", "decoded image is too large") from error
    except (UnidentifiedImageError, OSError) as error:
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler PNG is invalid") from error

    image = cv2.imdecode(np.frombuffer(contents, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim != 3 or image.shape[2] != 4:
        raise ApiError(422, "INVALID_PERLER_IMAGE", "perler input must contain transparency")

    try:
        result = generate_perler(image, request.size, palette=request.palette,
                                 style=request.style, max_colors=request.maxColors)
        if request.includePreviews:
            for name, chart in (("beadPreview", False), ("chartPreview", True)):
                png = render_perler_preview(result, chart=chart)
                result[name] = prefix + base64.b64encode(png).decode("ascii")
        return result
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
