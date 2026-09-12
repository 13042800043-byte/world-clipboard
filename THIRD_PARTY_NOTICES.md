# Third-party references

以下开源项目用于产品研究、API 选型、算法参考或代码改编。

| Project | License | How it informed this demo |
| --- | --- | --- |
| [AR Cut & Paste](https://github.com/cyrildiagne/ar-cutpaste) | MIT | “拍摄现实对象并粘贴到数字端”的核心交互先例 |
| [pARallax](https://github.com/Kabra01a/pARallax) | MIT | 本地分割管线、目标适配器和降级思路 |
| [KineMouse](https://github.com/4shil/kinemouse) | MIT | pinch 手势的滞回与有限状态机思路 |
| [MediaPipe Samples for Web](https://github.com/google-ai-edge/mediapipe-samples-web) | Apache-2.0 | 后续 Hand Landmarker 与 Interactive Segmenter 的官方 Web API 参考 |
| [Perler Beads Generator](https://github.com/Jett-Wu/Perler_Beads_Generator) | MIT | 适配其区域采样/风格阈值、red-mean 色差、主色投票、候选颜色多样性及保守去杂色流程；MARD 221/291 色卡数据用于后端。不是完整编辑器移植 |
| [WeChat Mini Program Demo](https://github.com/wechat-miniprogram/miniprogram-demo) | MIT | `hand-detect` 的 VKSession 生命周期与 YUV WebGL 相机渲染经过裁剪和 TypeScript 改编后用于实时手势链路 |
| [OpenCV](https://opencv.org/) | Apache-2.0 | 后端图像解码、GrabCut、连通区域筛选、缩放与 PNG 编码 |
| [FastAPI](https://github.com/fastapi/fastapi) | MIT | 后端 multipart 上传、字段校验与 HTTP API |

另考察了 [perler-beads](https://github.com/Zippland/perler-beads)（AGPL-3.0）和 [perler-studio](https://github.com/real-jiakai/perler-studio)；它们仅用于产品对比，没有使用其中代码。

## Perler Beads Generator license

Adapted source files (snapshot read 2026-09-12):

- https://github.com/Jett-Wu/Perler_Beads_Generator/blob/main/src/imageToBeads.ts
- https://github.com/Jett-Wu/Perler_Beads_Generator/blob/main/src/palette.ts
- https://github.com/Jett-Wu/Perler_Beads_Generator/blob/main/LICENSE

Adaptation: `backend/app/perler.py`, palette data `backend/app/mard-palette.json`.
Kept alpha-based foreground selection instead of upstream edge-color background guessing;
used one conservative speckle pass instead of importing its full editor and region tooling.
The pixel-art plugin reuses this adapted image quantization and MARD palette through
`backend/app/paste_plugins/common.py`. LEGO/cross-stitch use the existing generic legacy
palette, not copied LEGO/DMC inventory or brand procurement data. Sticker layout, flat
same-color brick covering, and stitch preview rendering are project implementations.
No code/data copied from AGPL Zippland/perler-beads or unlicensed perler-studio.

MIT License

Copyright (c) 2026 Jett-Wu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## WeChat Mini Program Demo license

MIT License

Copyright (c) 2018 wechat-miniprogram

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
