"""Exercise the running API with anonymous synthetic fixtures, not a Mock UI."""
import argparse
import base64
import json
from pathlib import Path
from time import perf_counter
from urllib.request import Request, urlopen

import cv2
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--style", choices=("cartoon", "realistic"), default="realistic")
    parser.add_argument("--sample", choices=("package", "lineart"), default="package")
    args = parser.parse_args()
    image = np.zeros((1600, 1000, 4), dtype=np.uint8)
    for y in range(150, 1450):
        shade = int(18 * (y - 150) / 1300)
        image[y, 280:720] = (35 + shade, 93 + shade, 226, 255)
    image[170:370, 300:700] = (40, 190, 244, 255)
    image[620:690, 320:680] = (40, 25, 25, 255)
    image[840:865, 360:640] = (250, 250, 250, 255)
    image[150:250, 600:720] = 0
    if args.sample == "lineart":
        image = np.zeros((240, 240, 4), dtype=np.uint8)
        image[8:232, 8:232] = (151, 164, 180, 255)
        image[40:200, 71] = (60, 65, 68, 255)
        image[119, 40:200] = (60, 65, 68, 255)
        image[152:176, 144:168] = 0
    _, encoded = cv2.imencode(".png", image)
    source = "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    reports = []
    for size in (32, 48, 64):
        data = json.dumps({"image": source, "size": size, "palette": "mard221",
                           "style": args.style, "maxColors": 16, "includePreviews": True}).encode()
        request = Request(args.api_url.rstrip("/") + "/api/perler", data=data,
                          headers={"Content-Type": "application/json"})
        start = perf_counter()
        with urlopen(request, timeout=10) as response:
            body = response.read()
        elapsed = round((perf_counter() - start) * 1000)
        result = json.loads(body)
        assert result["paletteSize"] == 221
        assert len(result["cells"]) == size * size
        assert len(result["colors"]) <= 16
        assert sum(c["count"] for c in result["colors"]) == result["totalBeads"]
        for field in ("beadPreview", "chartPreview"):
            png = base64.b64decode(result[field].split(",", 1)[1], validate=True)
            (output / f"perler-{size}-{field}.png").write_bytes(png)
        reports.append({"size": size, "style": args.style, "sample": args.sample, "clientRoundTripMs": elapsed, "responseBytes": len(body),
                        "colors": len(result["colors"]), "beads": result["totalBeads"]})
    (output / "perler-api-verification.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
    print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
