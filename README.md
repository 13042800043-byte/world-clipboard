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
→ 手掌朝向摄像头，将食指光标放进物体内部并短暂停稳
→ 拇指与食指指尖对捏并保持约 0.15 秒（开发者工具可按住模拟）
→ 保持捏合并移动整只手（Drag）
→ 稳住手机：Grab 锁定选点，自动获取高清静态照片
→ 张开两指或松开触点（Release / Copy，使用已锁定选点和高清照片）
→ Clipboard
→ 拼豆模板
→ 32 × 32 拼豆图纸与色号统计
```

默认使用干净的演示界面，仍可按住屏幕模拟 Grab / Drag / Release。需要调试背景时，把 `miniprogram/config.ts` 的 `SHOW_DEBUG_CONTROLS` 改为 `true`，显示 `MOCK / CAMERA` 切换按钮；需要 RAW / FILTER / LOCK 面板时，另将 `miniprogram/vision/vision-config.ts` 的 `showCoordinateDebug` 改为 `true`。Mock 只验证光标与 Grab 动效，不生成虚构动物或伪造抠图结果。

真实抠图需要先启动本仓库自带的 Python 服务；服务不可达或超过 8 秒时，相机页会明确提示失败，不再用假图片伪装成功。

## 启动视觉后端

Windows PowerShell（Python 3.12+）：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

启动成功后访问 `http://127.0.0.1:8000/api/health`，应返回：

```json
{"status":"ok","segmenter":"opencv-grabcut"}
```

微信开发者工具中直接使用默认地址即可。真机调试时，把 `miniprogram/config.ts` 的 `VISION_API_BASE_URL` 改为电脑可被手机访问的局域网或 HTTPS 地址；两台设备需要处于同一网络。后端只在内存中处理上传图片，不会写入磁盘。该服务目前没有认证，只适合本机或受信任局域网演示，不应直接暴露到公网。

提高真实抠图成功率：让物体与背景有明显颜色或亮度差；物体完整进入画面；捏合光标落在物体内部而不是边缘；避免手指遮住目标主体。当前 OpenCV 版本会把光标位置标记为确定前景，再从该点向外提取连通对象。

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
- 稳定 Hover 的真实候选轮廓与 bbox（节流请求，不逐帧分割）
- Final Capture 使用原生 `takePhoto({ quality: 'high' })`，VisionKit 画面仅用于预选
- 高清 Point + Box、扩边 ROI、目标连通域、轻量形态学与一次模糊重拍
- 高清原图 RGB 保真，低清模型仅生成 Mask，不生成最终 RGB
- Clipboard 内容预览与五个 Paste Plugin 入口
- 独立 `/plugins/perler` 真实插件，从透明 PNG 生成 32 × 32 网格和材料统计

## Mock 开关

配置位于 `miniprogram/config.ts`：

```ts
DEBUG_MODE
SHOW_DEBUG_CONTROLS
USE_MOCK_HAND_TRACKING
USE_MOCK_SEGMENTATION
```

这些开关让 UI 与视觉模型解耦。当前 Hand Tracking 与 Segmentation 的 Mock 开关默认关闭：真机优先使用 VisionKit，分割请求本机后端。拼豆不再提供固定 Mock 图案，只接受真实透明抠图。

本轮高清抠图配置位于 `miniprogram/vision/cutout-config.ts` 和 `backend/app/cutout_config.py`。实现、接口、性能结果与待真机验收事项见 [Final Cutout P0 报告](docs/final-cutout-p0.md)。高级 Fine Model / Alpha Matting 尚未接入，不能只改开关就启用。

## 真机界面修复（2026-09-12）

- 两页自定义导航使用 `wx.getWindowInfo()` 与实际微信胶囊位置预留状态栏、菜单空间，Camera 仍保持全屏，选点坐标映射不变。浅色 Clipboard 页使用深色状态栏文字。
- 自定义按钮统一使用 `size="mini"`，卡片采用 border-box，避免微信默认按钮尺寸与 padding 将三列模板撑宽。
- 默认关闭额外调试控件与坐标面板，保留 Spatial Cursor 和触摸调试。黑色“已连接 / 展开”属于外部真机调试浮窗，需折叠或退出真机调试、改用普通预览；项目无法直接隐藏它。
- 无候选 bbox 的 GrabCut 搜索窗口改为选点周围半幅宽高、靠边直接裁切；有效候选 bbox 仍优先。它限制搜索范围，不等于识别出了目标边界。大物体应完整进入局部范围，或短暂停稳取得候选框；同色相连背景与透明瓶子仍可能分割错误，不能保证只输出瓶子，也不靠切断真实细杆伪造效果。
- Camera YUV 公式已对照 [微信官方示例](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/packageAPI/pages/ar/hand-detect/yuvBehavior.js)，本次未修改颜色矩阵或 Gesture Engine。偏色尚未完成真机归因，需在相同光照、机位下对比 VisionKit 预览、原生 Camera 和高清照片，不应直接通过加对比度掩盖问题。

验证：前端 92 项测试、后端 37 项测试通过；小程序 TypeScript、网页 build 通过。开发者工具自带命令行编译器通过全部 6 个 WXML、7 个 WXSS，全部 9 个 JSON 解析通过。新增布局回归覆盖刘海屏、模拟器缺失胶囊；新增真实 GrabCut 合成场景覆盖相连桌面、近色背景、靠边选点和真实细杆。IDE 自动化连接因端口超时未完成，仍需点击编译并进行真机视觉复验，这些结果不代表已经完成手机验收。

## 重复使用与捏合响应修复（2026-09-12）

- 每次返回 Camera 重新挂载 WebGL Canvas；离页或拍摄高清照片时取消旧 RAF、stop/destroy 旧 VisionKit 会话并释放渲染资源。启动查询、超时、Ready/Error 回调按生命周期隔离，旧回调不会把新页面切到触摸降级。
- 预览独立绑定默认 framebuffer 和自己的 VAO，禁用继承的混合、裁切及颜色写入限制，绘制后恢复 SDK 状态；取帧/绘制异常不再静默停住。YUV 通道仍遵循微信官方示例，没有通过调整颜色矩阵掩盖偏色。
- 临时 VisionKit 失败后保留触摸操作，下次重新进入 Camera 会再次尝试真实追踪；没有检测到手时隐藏静止的中央光标/选择框，提示“将手放入画面”，不再误导为正在追踪。
- 捏合开始/释放改为 **2 次独立有效观测**，归一化阈值为 **0.34 / 0.48**，丢手宽限 **220ms**。仍保留迟滞、重复观测去重、选点锁定和丢手后张开重置；不是单帧碰一下就触发，也不承诺某个实测手机延迟。

本轮验证：全部前端 106 项测试通过，小程序 TypeScript 通过；微信开发者工具自带编译器通过 6 个 WXML、7 个 WXSS，9 个 JSON 解析通过。新增覆盖连续五次返回相机、旧异步回调、会话释放、取帧/绘制失败恢复和共享 WebGL 状态。本轮没有修改后端或接入新模型，以上自动化结果不代表已完成手机视觉验收。

真机复验：完全关闭手机上的旧小程序，开发者工具重新编译并生成新预览；在相同光照下连续完成 5 次“抓取 → Clipboard → 返回”，再切换颜色/轮廓模式。手掌朝向摄像头、食指尖对准目标内部，短暂停稳，两指尖对捏并保持，再张开。若无手光标仍不出现、提示触摸降级，说明追踪相机没有启动，不是捏合阈值问题。若仍偏色，请对比原生 Camera 与 VisionKit 预览并保留新调试日志。黑色“已连接 / 展开”需折叠微信真机调试浮窗，普通预览不带该面板。

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
├── app/segmentation.py  # OpenCV 点提示 GrabCut 管线
└── app/perler.py        # 透明裁切、采样、色卡量化与统计
```

## 下一阶段

Spatial GUI P0 已加入 One Euro 滤波、2 次有效观测捏合/释放防抖、220ms 丢失宽限、捏合前选点锁定、Grab 帧保存及坐标调试层。改动原因、开关与真机验收见 [P0 记录](docs/spatial-p0.md)。这些改动仍需目标手机验证，不代表 SAM 分割已经完成。

1. 在目标 iOS / Android 真机上校准 VisionKit 点位顺序、Pinch 阈值与坐标映射。
2. 用真机样本校准 OpenCV GrabCut，并评估替换为 SAM / RMBG 的同接口 Adapter。
3. 校准预览裁切、旋转、镜像和截图坐标映射。
4. 根据比赛现场材料替换或扩充拼豆实体色卡。

当前已接入真实 VisionKit 手部追踪、OpenCV 分割后端与真实拼豆生成。Mock 仅用于手势 UI 调试，不再伪造内容。第一阶段继续以 SEE → PINCH → GRAB → COPY → CREATE 的可靠闭环为准。

## 开源参考

架构与交互研究参考了 AR Cut & Paste、pARallax、KineMouse、Google MediaPipe samples 和 Perler Beads Generator；当前代码为独立实现，归属与链接见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

微信工程结构与 TypeScript 配置同时对照了微信官方的 [miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo) 与 [API typings](https://github.com/wechat-miniprogram/api-typings)；触摸手势边界参考官方 [miniprogram-gesture](https://github.com/wechat-miniprogram/miniprogram-gesture) 示例。

实时帧接入沿用官方 Camera 示例中的 [`createCameraContext` / `onCameraFrame`](https://github.com/wechat-miniprogram/miniprogram-demo/pull/32/files) 生命周期。VisionKit 会话与 YUV 相机渲染改编自官方 MIT 许可的 [`hand-detect`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/master/miniprogram/packageAPI/pages/ar/hand-detect) 示例，并在进入后台或离开页面时释放。
