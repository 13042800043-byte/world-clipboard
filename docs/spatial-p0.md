# Spatial GUI P0 改造

保留双页面、VisionKit、WebGL 相机、真实 OpenCV 后端及独立拼豆插件。没有改成 MediaPipe，没有动物 Mock。ClipboardItem 和分割 API 不变。

## 管线与文件

Anchor → HandGestureAdapter（距离、滤波、防抖、选点）→ SpatialController（selection / drag 分离）→ Grab 保存画面 → Release 上传锁定画面和点 → Clipboard → Perler。

新增 `vision-config.ts`、`coordinate-transform.ts`、`one-euro-filter.ts`；调整手势 Adapter、SpatialController、Camera、光标样式及捕获文件写入。

## 坐标契约

屏幕归一化：左上 `(0,0)`、右下 `(1,1)`。距离先将 dx 乘 viewWidth/viewHeight，再除掌宽，避免竖屏单位不同。

WebGL 截图已应用 VisionKit displayTransform，上传点保持 identity，不再次裁切/旋转/镜像；DPR 仅影响分辨率。原生 Camera 后备读取照片真实尺寸与 EXIF 方向，对已纠正方向照片做中心 aspect-fill 反向映射。OpenCV IMREAD_COLOR 同样处理 EXIF，有回归测试。

通用 CoordinateTransform 支持 cover、90/180/270 度和镜像，但当前后置 WebGL 路径不额外启用这些变换。数学单测不等于手机 Anchor 与画面的硬件校准。

照片 API 签名按微信官方 [api-typings](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts) 校验；微信文档页面本次无法访问，用官方类型源码替代。

## 手势与选点

参数统一在 `vision/vision-config.ts`：2026-09-12 响应修复后开始 `<0.34`、释放 `>0.48`，各连续 2 个独立有效观测（原先为 0.28 / 0.42、3 次观测）。阈值间保持现状；非法观测不当作松手，重复时间戳不会加速确认。实际手机识别延迟需真机测量。

Hover 使用食指尖，Grab/Drag 用两指中点。One Euro 默认 minCutoff=1.5Hz、beta=8、derivativeCutoff=1Hz；`useOneEuroFilter` 可关闭。根据[算法作者说明](https://gery.casiez.net/1euro/)实现，参数是初始值，需真机慢动/快动校准，不声称测得真机帧率提升。

首次 Pinch Candidate 冻结约 100ms 前 Hover 位置，以邻近样本中位数抗抖；selection 不跟随 Drag，过旧历史不带入下次抓取。Grab 时导出当前画面，Release 不重新拍照或取点。

220ms 内丢失：冻结，不产生 HOLD/END；超过宽限：取消，不复制。抓取中丢失后要先稳定张开两指再捏合。watchdog 处理没有 removeAnchor 回调的情况；离页清理定时器并使旧异步结果失效。Touch 与 VisionKit 互斥；touchcancel 只取消；一次抓取最多一次上传/跳转。共享截图文件串行写入，避免旧写入覆盖新图。

## UI 与真机验收

去掉拖动框的 560ms 位置 easing 及光标的 50ms 位置 easing，保留 Copy 飞行动画。这是代码动画参数变化，实际端到端延迟尚未在手机测量。

`DEBUG_MODE` + `showCoordinateDebug`：橙色 RAW 圈、白色 FILTER 光标、LOCK 十字、阶段/距离/候选计数；Grab 后显示整张捕获帧缩略图和提交点，图片不做 cover。正式演示可关 `showCoordinateDebug`。

1. 同一可信 Wi-Fi，后端监听 `0.0.0.0:8000`，手机可访问 config 中 IP 的 `/api/health`。
2. 开发者工具重新编译、生成新真机预览，不用旧二维码包。
3. 手掌向镜头，食指光标放进目标内部，稳定约 0.2 秒；两指尖对捏、保持、移动、张开。
4. Grab 后先保持捏合，核对缩略图十字是否在原目标；拖动不应改变十字。若不对齐，保存调试截图，先校准而非换分割模型。
5. 短遮挡维持；长遮挡取消且不跳页；恢复先张开。
6. 松手仅进入一次 Clipboard，点击拼豆得到真实 32×32 图纸；失败仍显示具体捕获/上传/分割错误。

## 后续边界

P1 未完成：稳定 Hover 候选、真实白色轮廓、捏合前帧缓存、高清截图及清晰度门控。当前仍为中性选择框；点来自捏合前，图来自确认 Grab 当时，镜头需保持稳定。

P2 未完成：点+框 SAM Adapter、手部负提示和候选评分。当前仍是 GrabCut，复杂背景或手遮挡时质量有限，本次手势改造不保证任意物体都能抠出。
