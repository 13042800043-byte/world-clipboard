# Final Cutout P0 实施报告

日期：2026-09-12。按 `World_Clipboard_Final_Cutout_Upgrade_Codex.md` 增量实现 P0；代码及本机 HTTP 检查通过，手机相机切换和实际抠图质量仍需真机验收。没有扩展插件或重写双页面 UI。

## 1. 修改文件与复用

新增小程序模块：

- `vision/cutout-config.ts`：拍照、稳定窗口、重拍和 Hover 节流配置。
- `vision/final-capture-controller.ts`：相机桥接、高清照片 point/bbox/负点坐标重映射，失败也归还相机。
- `vision/final-segmentation-controller.ts`：分割编排，仅 `BLURRY_CAPTURE` 最多重拍一次。
- `vision/hover-selection-controller.ts`：稳定 Hover、单请求在途、候选过期、移动后的旧响应丢弃。
- `vision/hand-negative-prompt.ts`：保守的掌部/腕部负点，避开选点与目标 bbox。

修改 `pages/camera/camera.ts/.wxml/.wxss`，接入候选轮廓和高清拍照；复用原 `CoordinateTransform`、EXIF 尺寸处理、选点锁定和 SpatialController。修改 `frame-capture.ts` 支持 high 和超时、`visionkit-hand-tracker.ts` 支持有意拍照暂停后续接、`visionkit-hand-session.ts` 隔离旧会话回调。修改 segmentation 类型、remote adapter、vision-api 和微信声明，使用向后兼容的可选字段。

新增后端 `app/cutout_config.py`、`app/final_cutout.py`、`app/mask_refiner.py`；修改 `app/main.py`、`app/segmentation.py`。新增/补充对应 Python/TypeScript 回归测试与 `backend/tools/smoke_final_cutout.py`。

ClipboardItem 和 Perler 核心没有改动。Perler 请求长度上限扩大以接收高清 PNG，解码后 20MP 上限保留。

## 2. 当前管线

```text
VisionKit 21点 → 原有滤波/手势状态机
→ 食指 Hover 稳定250ms → 低清预选（最长384px，最多每1秒一次）
→ 真实候选 Mask/BBox/白色轮廓
→ Pinch锁定点和可用候选快照
→ 暂停VisionKit，挂载后置原生Camera，等待initdone
→ 稳定180ms → takePhoto high → 读取实际尺寸/EXIF
→ 屏幕点、bbox、手部负点映射到高清照片
→ Release后提交Final请求
→ 高清照片的低清Point+Box预分割
→ 主体bbox每侧扩30%，裁出原图ROI
→ 独立OpenCV引导式ROI精修（模型最长1024px）
→ 原ROI尺寸Mask → 选点对应连通域 → 小尺度形态学/小洞修补
→ 原图RGB + 最终Alpha → RGBA PNG → Clipboard → 原Perler插件
```

实时图只用于 Selection，不作为默认 Final RGB。高清抓取期间保留已抓住反馈，暂不更新手势；恢复 VisionKit 后最多等待1200ms第一帧有效手部数据，再续接 Release 判断。超时取消而不伪造松手。正常跟踪中的真丢手仍使用原150ms保护，旧原生会话的回调不能污染新会话。

没有有效 Hover bbox 时（例如触摸模式或候选过期），不会伪造 bbox：高清照片先做真实点提示预选，得到 bbox 后再限制 ROI。这个回退不等于已验证 Point+Box 在所有实拍场景都更稳定。

坐标假设：竖屏、后置摄像头、无镜像、居中 aspect-fill。照片尺寸使用 EXIF 旋转后的坐标，与 OpenCV 解码方向一致；ROI Mask 使用明确的缩放/平移回到照片坐标。Camera 与 VisionKit 若在特定设备上有不同 FOV/电子防抖裁切，仍需设备校准；本轮没有 SLAM 或跨照片目标追踪。

## 3. 开关

默认开启：High Res Final Capture、Point+Box、Connected Component Cleanup、Mask Morphology、Hand Negative Prompt、Sharpness Gate、Hover Selection。

默认关闭：Fine Cutout Model、Alpha Matting、Foreground Decontamination。这三项属于未安装的 P1/P2 能力，不能只翻开关；后端会明确拒绝未配置的能力，而不是假装运行了它们。

后端参数：ROI每侧扩边0.30；模型最长1024；3×3开/闭各1次；仅填面积≤12px小洞；组件最小16px；选点邻域搜索8px。开运算若破坏细长结构或损失过多主体则不采用。没有找到附近合理组件就失败，不退回无关最大组件。

清晰度：主体bbox另加每侧15%小边界、最长512px上算 Laplacian variance，初始阈值4.0。质量检查范围与精修扩边解耦，避免改变精修ROI大小就误判模糊。阈值不是通用相机标定值；低纹理和低对比仍可能误判。客户端最多延迟100ms重拍一次；不回退低清视频帧。

## 4. 真实与占位能力

真实：官方 VisionKit 手跟踪、Camera高清拍照、OpenCV GrabCut预选/ROI精修、组件清理、形态学、清晰度检测、透明PNG和原有真实拼豆。

当前 Prompt Segmenter 不是 SAM2，FineCutoutAdapter 默认实现也不是 BiRefNet/RMBG。Adapter 已独立，可替换；尚无学习式精细模型、Trimap/Matting、前景颜色去污染。二值Alpha无法自然还原绒毛、玻璃或半透明边缘。没有固定动物图片或伪造成功回退。

调试：页面显示高清照片及映射选点、实际尺寸、点/bbox、抓取时间和手/光标速度；Debug Final 响应及控制台提供ROI、Mask面积、组件数、锐度、原图/输出尺寸、精修耗时。没有SAM score，不伪造。图片仍只在内存/微信临时照片中处理，不新增后端落盘图片。

## 5. 检查与性能

- 全量前端86项测试、原生小程序TypeScript检查、H5构建和后端28项pytest通过。后端有两项现有测试工具弃用警告，不影响通过；没有实际操作微信开发者工具编译或手机相机。
- 回归证明：输入1200×800，最终Mask仍1200×800，目标PNG约500×400；PNG RGB逐像素来自原图，保留细色纹，不是384px结果放大。
- HTTP冒烟验证真实监听后端的 Selection → Point+Box Final → 32×32 Perler。使用合成场景，不是手机或现实物体质量验收。
- HTTP合成场景最近一次：预分割141ms、ROI精修及清理625ms、算法总计769ms。最费时的是ROI GrabCut精修；不能当作手机端到端延迟保证。高清相机切换/对焦、上传、PNG编码时间不包含在算法 `totalMs` 中。
- `pnpm audit --prod` 当前未发现已知漏洞。未新增模型依赖。

## 6. 真机验收与下一步

当前演示后端已重启，地址仍由 `miniprogram/config.ts` 指定。微信开发者工具重新编译，并重新生成手机预览；旧预览不会自动获得新代码。

验证顺序：

1. 使用不反光、硬边、与背景颜色不同的现实物体，保持手机竖直不移动。
2. 食指光标放进主体，等白色候选轮廓正确再捏合；拍照窗口保持手机与物体稳定，避免手遮挡主体。
3. 确认调试照片十字位于同一个物体内部；若偏移，先修设备坐标/FOV，不继续堆模型。
4. 松开后确认透明PNG清晰，再进入拼豆；测试重新抓取、模糊重拍、取消、切后台、恢复跟踪。
5. 若出现高清相机启动超时/权限失败，记录手机系统、微信版本、页面错误及控制台；不要改成静默低清回退。

仍会失败：复杂同色背景、手与物体大幅重叠、多个接触物体、拍照时相机/目标移动、玻璃反光、绒毛和半透明边缘。负点只是降低手部污染风险，不能补全被手遮住的目标；连通域只能去除不相连的背景。现有上传5MB、解码20MP限制保留，超大照片会明确拒绝，不做静默降清晰度处理。

先验收P0。若硬边对象选得正确但细边仍差，下一步值得接入ROI FineCutout模型；绒毛/柔和边缘再加Alpha Matting；白halo后续再做去污染。现在不扩展其他插件。

## 来源

- [微信官方 API typings](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)：takePhoto quality、getImageInfo原始尺寸和orientation定义。
- [OpenCV GrabCut 官方教程](https://docs.opencv.org/4.x/d8/d83/tutorial_py_grabcut.html)：mask labels和GC_INIT_WITH_MASK。
