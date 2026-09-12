# 世界粘贴板 / World Clipboard

一个可直接导入微信开发者工具的原生微信小程序 Prototype。核心交互是 Promptless Interaction：动作本身就是 Prompt，让现实里的物体、颜色和轮廓像数字内容一样被 Copy / Paste。

## 微信小程序运行

1. 打开微信开发者工具，选择「导入项目」。
2. 项目目录选择本仓库根目录（包含 `project.config.json` 的目录）。
3. 项目已配置当前测试小程序 AppID；团队成员需使用已获得开发权限的微信账号登录开发者工具。
4. 点击「编译」。首屏会直接进入 Camera Page。

体验路径：

```text
Camera
→ 选择 物体 / 颜色 / 轮廓
→ 真机中用拇指与食指捏合（开发者工具可按住模拟）
→ 移动手势或触点（Drag）
→ 松开捏合或触点（Release / Copy）
→ Clipboard
→ 拼豆模板
→ 32 × 32 拼豆图纸与色号统计
```

Camera 页右上角的 `MOCK / CAMERA` 可以切换演示背景。开发者工具没有摄像头画面或真机权限尚未配置时，使用 Mock 背景仍可走通全部交互。

真实抠图需要先启动本仓库自带的 Python 服务；服务不可达或超过 8 秒时，小程序会自动回退到 Mock，不会中断演示。

## 启动视觉后端

Windows PowerShell（Python 3.12+）：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

启动成功后访问 `http://127.0.0.1:8000/api/health`，应返回：

```json
{"status":"ok","segmenter":"opencv-grabcut"}
```

微信开发者工具中直接使用默认地址即可。真机调试时，把 `miniprogram/config.ts` 的 `VISION_API_BASE_URL` 改为电脑可被手机访问的局域网或 HTTPS 地址；两台设备需要处于同一网络。后端只在内存中处理上传图片，不会写入磁盘。该服务目前没有认证，只适合本机或受信任局域网演示，不应直接暴露到公网。

## 当前完成

- 原生 TypeScript / WXML / WXSS 工程与自定义双页面导航
- 全屏后置 Camera、节流后的实时 Camera Frame Listener 与 Debug Mock Scene
- 基于微信官方 VisionKit 的实时手部 Anchor、21 点适配、Spatial Cursor 与 Pinch 识别
- 物体、颜色、轮廓三种捕捉模式
- Spatial Cursor 与独立 Gesture State Machine
- Touch / Mouse 模拟 Pinch、Grab、Drag、Release
- 目标吸附、缩放和飞入 Clipboard 的 Copy 动画
- 统一 `ClipboardItem` 数据模型和内存 Store
- VisionKit Hand Tracker（不支持时自动降级）
- Python / FastAPI / OpenCV 点提示分割服务，返回透明 PNG、Mask 与归一化 bbox
- Camera / VisionKit 当前帧文件捕获、上传、响应校验与 8 秒自动 Mock 回退
- Clipboard 内容预览与五个 Paste Plugin 入口
- 独立 `/plugins/perler` Mock 插件，输出 32 × 32 网格和材料统计

## Mock 开关

配置位于 `miniprogram/config.ts`：

```ts
DEBUG_MODE
USE_MOCK_HAND_TRACKING
USE_MOCK_SEGMENTATION
USE_MOCK_PERLER
```

这些开关让 UI 与视觉模型解耦。当前 Hand Tracking 与 Segmentation 的 Mock 开关默认关闭：真机优先使用 VisionKit，分割优先请求本机后端；后端不可达时仍自动回退 Mock。拼豆目前保留 Mock，保证演示稳定。

## 本地质量检查

需要 Node.js 20+ 与 pnpm：

```bash
pnpm install
pnpm typecheck:miniprogram
pnpm test:miniprogram
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

仓库仍保留前一版 H5 原型，运行方式为：

```bash
pnpm dev
```

浏览器打开 <http://127.0.0.1:5173>。

## 目录边界

```text
miniprogram/
├── pages/          # Camera / Clipboard 两个核心页面
├── components/     # 模式选择、光标、模板卡片、对象预览
├── interaction/    # Spatial Controller 与状态机
├── vision/         # Hand / Segmentation / Color / Contour Adapter
├── clipboard/      # 基础数据模型与 Store
├── plugins/perler/ # 拼豆插件，不侵入 Clipboard 核心
└── services/       # 视觉 API 契约与响应校验

backend/
├── app/main.py          # FastAPI 上传接口与安全边界
└── app/segmentation.py  # OpenCV 点提示 GrabCut 管线
```

## 下一阶段

1. 在目标 iOS / Android 真机上校准 VisionKit 点位顺序、Pinch 阈值与坐标映射。
2. 用真机样本校准 OpenCV GrabCut，并评估替换为 SAM / RMBG 的同接口 Adapter。
3. 校准预览裁切、旋转、镜像和截图坐标映射。
4. 把拼豆插件从 Mock 图案升级为透明 PNG 的裁切、量化、色卡映射与网格生成。

当前已接入真实 VisionKit 手部追踪与可运行的 OpenCV 分割后端，同时保留全链路 Mock 降级。第一阶段继续以 SEE → PINCH → GRAB → COPY → CREATE 的可靠闭环为准。

## 开源参考

架构与交互研究参考了 AR Cut & Paste、pARallax、KineMouse、Google MediaPipe samples 和 Perler Beads Generator；当前代码为独立实现，归属与链接见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

微信工程结构与 TypeScript 配置同时对照了微信官方的 [miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo) 与 [API typings](https://github.com/wechat-miniprogram/api-typings)；触摸手势边界参考官方 [miniprogram-gesture](https://github.com/wechat-miniprogram/miniprogram-gesture) 示例。

实时帧接入沿用官方 Camera 示例中的 [`createCameraContext` / `onCameraFrame`](https://github.com/wechat-miniprogram/miniprogram-demo/pull/32/files) 生命周期。VisionKit 会话与 YUV 相机渲染改编自官方 MIT 许可的 [`hand-detect`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/master/miniprogram/packageAPI/pages/ar/hand-detect) 示例，并在进入后台或离开页面时释放。
