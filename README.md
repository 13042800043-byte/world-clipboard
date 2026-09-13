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
→ 拼豆 / 贴纸 / 像素画 / LEGO 平面拼搭 / 十字绣
→ 调参数、预览图案与图纸（拼豆默认 64 × 64）
→ 新插件可放大查看、保存 PNG
```

默认使用干净的演示界面，仍可按住屏幕模拟 Grab / Drag / Release。需要调试背景时，把 `miniprogram/config.ts` 的 `SHOW_DEBUG_CONTROLS` 改为 `true`，显示 `MOCK / CAMERA` 切换按钮；需要 RAW / FILTER / LOCK 面板与最近 10 秒遥测时，将 `miniprogram/vision/gesture-config.ts` 的 `GESTURE_PROFILE` 改为 `'debug'`，保持 `DEBUG_MODE=true` 并重新编译。默认 `'stable'`，保留 `'current'` 对照与 `'responsive'` 实验档。Mock 只验证光标与 Grab 动效，不生成虚构动物或伪造抠图结果。

第二轮手势优化：掌宽时间滤波、时间+观测数确认、短时丢失保护、闭合前锁点与拖动分离、拍照恢复会话保护、刷新节奏及 Debug 耗时记录。分析、参数、合成对比结果和十项真机验收见 [Gesture Round 2](docs/gesture-round2.md)。本轮不修改 Segmentation / Final Cutout；合成测试耗时不代表手机端到端延迟。

物体 / 轮廓的真实抠图需要先启动本仓库自带的 Python 服务；服务不可达或超过 8 秒时，相机页会明确提示失败，不再用假图片伪装成功。**颜色抓取在小程序端读取照片，不需要分割后端。**

### 颜色抓取

选择底部「颜色」→ 将光标放在要取的颜色内部，避开边缘、高光和手指遮挡 → 捏合并稳住手机（工具中可按住屏幕模拟）→ 松开 → Clipboard 显示色块、HEX 与 RGB。取色位置使用最初 Grab 锁定的照片坐标，不使用拖动终点。

已修复 `color capture is handled on device`：此前最终 Grab 无条件进入分割器，导致颜色被后端 Adapter 拒绝。现在颜色独立走 `PhotoColorCapture`，在离屏 2D Canvas 读取最多 9×9 邻域、去掉最暗 / 最亮各 20% 后求均值；物体 / 轮廓仍走原分割流程。照片边缘裁切邻域，不拉伸或读越界；空像素、加载失败 / 超时给出本地错误，不伪造黑色。分割控制器的类型也明确排除颜色。

2D 离屏 API 使用新版 object 参数和画布自身的 `createImage`，不混用 VisionKit WebGL 图片；签名核对了[微信官方 API typings](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)，以及 [OffscreenCanvas 文档](https://www-sg.tencentcloud.com/document/product/1219/57691)。当前工程基础库 3.17.3，符合该 API 需要的 2.16.1+；如果运行环境不支持，会明确提示升级微信。

验证：新增锁点颜色分流、邻域去极值、边缘采样、空像素和超时 / 迟到回调测试，159 项前端测试、小程序 TypeScript 和两页 WXML/WXSS 编译通过。手势算法、照片锁点 / 拍照交接和后端未改。颜色来自相机 RGB，会受自动白平衡、曝光与光照影响，不是经过实物校色的测色仪；不同手机的照片方向 / 实际取色对应关系仍需真机测试。关闭旧小程序、重新编译并生成新预览后生效。

### 轮廓抓取与物体抓取的区别

选择「轮廓」后按同样的 Grab / Release 操作，Clipboard 展示 **#111111 单色剪影 + 透明背景**，不包含物体原色、纹理或照片中的文字；「物体」仍显示原色透明抠图。轮廓直接复用已有分割 Mask，不重新执行模型推理，透明孔洞以 Mask 的实际结果为准（不额外修补或臆造孔洞）。

`/api/segment` 的 `mode=contour, stage=final` 现在返回剪影 `preview` 和真实 `contour` 坐标，Adapter 写入已有 `ClipboardItem.contour`，不修改基础数据结构。坐标是原始照片归一化坐标，不是剪影裁切坐标；最多 1024 个顶点，仅最大外环，内孔仍由 PNG alpha / Mask 保留。候选 selection 阶段保持原有白色悬停描边，手势、物体和本地取色流程不改。外环提取与简化使用 [OpenCV 官方 contour / approxPolyDP 接口](https://docs.opencv.org/4.x/dd/d49/tutorial_py_contour_features.html)，不是矩形 Mock，也不是把彩色图片做 CSS 灰度处理。

后端与小程序需一起更新：本次服务已重启，手机关闭旧预览后重新编译、生成新预览并重新抓取，旧 Clipboard 项目不会自动变成轮廓。若服务还在运行旧代码，小程序会提示更新后端，不再把旧彩色预览伪装成轮廓。验证：167 项前端、102 项后端测试和小程序 TypeScript 通过；合成场景已通过局域网实时 API 检查，不等于完成目标手机视觉验收。轮廓准确度仍依赖当前分割 Mask。

实时模式分流检查（输出到忽略的 `test-results/contour`）：

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/verify_contour.py --api-url http://192.168.28.20:8000
```

若电脑局域网 IP 改变，请同时调整命令和 `miniprogram/config.ts` 的地址。

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
- 独立 `/plugins/perler` 真实插件，可选 32 / 48 / 64 网格和材料统计
- 贴纸、像素画、LEGO 平面拼搭、十字绣四个可用转换插件与原生工作区

## 贴纸 / 像素画 / LEGO / 十字绣（2026-09-13）

五个入口全部启用，仍使用 Camera / Clipboard 两页。**先抓取真实物体完成抠图，再点模板**；这里的“贴图”实现为透明贴纸，不是 3D UV 贴图。所有转换基于当前 RGBA PNG，不显示固定动物图，也不重复调用分割模型。新工作区顶部有原图小预览、四插件切换和「返回模板」。

- **贴纸**：alpha 裁切、无白边 / 8px / 16px 白边；保留原图颜色，最长边上限 1024px。棋盘格仅用于预览；「保存透明贴纸 PNG」导出透明图片。「六枚排版」为 1200×1697 白底 PNG，可独立保存；打印尺寸由用户设置，不提供矢量刀线。白边会收紧透明小孔，必要时选无白边。
- **像素画**：32 / 48 / 64 格、8 / 16 / 24 色上限、221 色 MARD 图像调色板；保持比例和透明孔，提供图案、坐标色号图及 nearest-neighbor 放大透明 PNG。小字/密纹仍受网格分辨率限制。
- **LEGO**：**二维单层平面模板，不是 3D 重建**。同色格合并为 1×1、1×2、1×3、1×4、2×2、2×3、2×4 等常用规格（允许旋转）；坐标图的粗线表示每块砖的边界。清单按本图颜色 / 砖块尺寸统计，砖块数不是凸点数。不跨色、不覆盖空孔，采用较大规格优先，不保证全局最少砖数。底板另备；使用通用 13 色近似值，实际颜色 / 规格 / 库存需现场核实，不提供官方采购 ID。
- **十字绣**：一格一针完整十字，空白不落针；绣制预览、坐标色号针位图、颜色针数和 14CT 全网格尺寸估算。通用 13 色、本图 T 色号不是 DMC 编号；不估计真实耗线长度，裁布另留装裱边。

新插件均提供参数调整、读取 / 错误 / 重试、预览与图纸切换、放大以及保存 PNG。图片先写入十二个固定复用的 app-owned 文件，页面仅接收文件路径与小型元数据，不将三张大 PNG 塞进 `setData`。隐藏 / 离开 / 换插件会失效过期请求；从相册授权或原生放大返回保留已完成工作区，生成中被打断会重试。保存仅由用户点击触发；拒绝权限时会提示设置方法，不自动申请其它权限。微信 API 参考：[Image API](https://intl.cloud.tencent.com/jp/document/product/1219/57745)。

`POST /api/templates/{kind}` 的契约、输入限制与验收项见 [插件说明](docs/paste-plugins-spec.md)，选择轻量后端生成与本地 PNG 展示的原因见 [ADR-001](docs/decisions/001-paste-plugins.md)。既有 `/api/perler` 和 `ClipboardItem` 不变，手势与抠图链路未修改；未增加模型或运行依赖。像素量化复用既有 MIT 算法与色卡，归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。

本轮验证：**153 项前端测试、99 项后端测试**、小程序 TypeScript、全套 WXML/WXSS 原生编译通过；`pnpm audit --prod` 未报告已知漏洞。当前后端已重启，使用配置中的 `http://192.168.67.18:8000` 完成四接口 HTTP 200 检查。48 格匿名合成包装的电脑往返（含三张 PNG）约为贴纸 262ms、像素 209ms、LEGO 339ms、十字绣 220ms；输出 PNG 已视觉检查，贴纸 / 像素导出为 RGBA，LEGO 120 块、十字绣 812 针均与材料统计一致。**不是手机实测或真实照片质量评分**；真机布局、透明 PNG 相册保存和实际拼搭 / 绣制仍待现场验证。

复验命令（仓库根目录）：

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/verify_paste_plugins.py --api-url http://电脑局域网IP:8000 --output-dir test-results/paste-plugins
```

真机验收：完全关闭旧小程序 → 微信工具重新编译 / 预览 → 抓取真实物体 → 逐个打开四模板 → 调白边或网格 → 放大 → 返回后确认工作区保留 → 保存正确 PNG → 核对 LEGO 砖块边界 / 清单、十字绣针数 → 返回模板再进入。若报生成失败，先确认运行的是新版后端且日志出现 `/api/templates/... 200`；手机不能使用 `localhost / 127.0.0.1`，换网络后要更新局域网 IP。

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

## 拼豆显示修复（2026-09-12）

真机截图中完整抠图对应的拼豆被显示为斜条。旧实现将 1024 格置于固定 `640rpx` 宽的自动换行容器，每格 `20rpx`；尺寸转换误差可能改变实际换行点，使后续每行错位。现在由插件内 `buildPerlerRows` 按后端 row-major 顺序明确切为 32 行，每行 32 格，禁止自动换行，格子均分行宽；图纸按父容器宽度保持正方形，不依赖固定 rpx 格宽。采用显式行结构，而不是仅调整板宽掩盖错位，也没有更换抠图或量化算法。

原有透明区域、保持比例裁切、色卡与数量统计不变；读取/失败状态仍保留。模板按钮增加内部竖排容器，名称与“即将开放”明确分行。WXML 的循环别名与 rpx 适配规则对照 [腾讯官方 WXML](https://www-sg.tencentcloud.com/jp/document/product/1219/60345) 和 [WXSS 说明](https://www.tencentcloud.com/pt/document/product/1219/61744)。

验证：前端 124 项、后端 38 项测试通过；小程序 TypeScript 和全部 6 WXML / 7 WXSS 编译、9 JSON 解析通过。新增 8/32/64 网格行列/顺序与错误尺寸测试，后端竖长包装测试确认直立轮廓和逐格坐标。当前页面仍使用 32×32，64 格性能未做手机测试。关闭旧小程序、重新编译预览后，使用竖长物体检查图纸应居中直立，而不是连续斜条；以上检查不等于已完成真机视觉验收。本轮无需重启后端。

## 开源拼豆算法适配升级（2026-09-12）

对比了 [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator)、[Zippland/perler-beads](https://github.com/Zippland/perler-beads)、[perler-studio](https://github.com/real-jiakai/perler-studio)。选择 MIT 的 Jett-Wu 作为主要实现参考，读取 `imageToBeads.ts`、`palette.ts` 与 LICENSE 后移植适合现有 Python + 微信架构的生成阶段。Zippland 为 AGPL，perler-studio 本次未确认可复用许可证，未复制它们的代码/数据。不声称这是所有照片效果“绝对最好”的项目，也不是导入整套网页编辑器。

- 原 UI 的 13 色演示色板升级为 **MARD 221 色卡**（后端也提供 291 选项），采用加权 red-mean 色差，不冒称 CIEDE2000。数据是开源 HEX 参考值，未做实物校色，源文件和 MIT 版权见 [第三方说明](THIRD_PARTY_NOTICES.md)。
- 每格做 7×7 / 5×5 区域采样和 alpha 加权投票；“清晰色块”优先主色、保守去近色孤点，“保留细节”在无主色时使用均值回退。候选颜色按频率与差异选择，保护深色线条/饱和特征，不默认增加抖动噪点。透明孔不会填白，白色前景不会当背景删除。
- 手机工作区提供 **32 / 48 / 64 格、两种风格、8 / 16 / 24 色上限**。默认 48 格、清晰色块、16 色，针对真实照片比旧 32 格保留更多信息，但小字和遮挡不保证还原。
- 后端输出圆孔拼豆效果和带行列坐标/MARD 色号、每 8 格加粗辅助线的高清 PNG。小程序切换显示并通过[微信 previewImage](https://intl.cloud.tencent.com/zh/document/product/1219/57745)放大；先将 PNG 写入两个重复使用的本地文件，不把 base64 直接当预览 URL。返回放大预览保留工作区，新物体/离页使旧请求失效。旧后端缺少预览时保留明确行列的 UI 后备，并显示“旧版色卡 · 请更新后端”。

`POST /api/perler` 增加可选字段 `palette`, `style`, `maxColors`, `includePreviews`；旧调用默认 legacy / realistic / 16，不破坏原有 grid/cells/colors/totalBeads 字段。旧调用也使用新采样算法，不保证与历史输出逐格完全相同。响应附加 `paletteId/paletteSize/style/maxColors`，请求预览时附加 `beadPreview/chartPreview`。手势、真实抠图和 ClipboardItem 未修改。

本轮检查：129 项前端测试、58 项后端测试、小程序 TypeScript、全部 WXML/WXSS 编译通过。无新增运行依赖。通过配置中的局域网地址运行 `backend/scripts/verify_perler_quality.py`，1600×1000 **合成测试包装**的 32/48/64 请求（含两张 PNG）往返约 426/509/930ms，响应约 101/199/330KB；这是电脑访问当前后端的结果，不是手机实测或实际照片质量评分。生成的图纸/拼豆 PNG 已视觉检查，原生手机布局、真实照片质量及 64 格色号可读性仍需新预览验收。

本机后端已重启到新版；如果自行启动，仍使用现有 uvicorn 命令。完全关闭旧小程序、重新编译预览，抓取实际物体后点击拼豆，核对色卡标记和两种预览，必要时切 64 格或“保留细节”。高级手动逐格编辑、完整 3D、PDF/Excel 导出未移植，继续保留两个核心页面。

## 细线与手机预览修复（2026-09-12，晚间）

用户真机截图显示：浅色线稿被主色投票吞掉，圆孔只占每格约 54% 原色面积，进一步冲淡细节。现在默认 **64 格 / 线条保留 / 最多 16 色**；色块简化仍可选。

- `realistic` 提高到 9×9 采样；对高 alpha 覆盖的内部区域，保留有邻格支持、占比 10–45%、相对局部主色明显更暗的真实采样线条。仅选择现有候选色，不新增黑边、不膨胀 Mask、不填透明孔。灰线也有回归覆盖。低于采样尺度、过密或低对比纹理仍会丢失/合并，不保证逐条还原小字或马头密纹。
- `beadPreview` 字段保持兼容，但内容改为**实心图案预览**，不再绘制圆孔、投影或背景针点；带色号/坐标的 `chartPreview` 不变。材料统计仍来自同一 grid，而非预览截图。
- 进入拼豆后隐藏大原图和未开放插件画廊，显示紧凑原图栏、参数和图案；顶部导航保持吸顶。返回模板可重新选择，生成中退出后重置 loading，并失效旧响应。
- 增加采样后，电脑 profile 的 64 格纯色板耗时约 2.597s，其中 2.501s 在 nearest 色卡匹配；改为 24-bit RGB **精确去重**后相同夹具约 0.113s，inverse 映射保留原 alpha 权重和重复频次，不做额外粗量化。

验证：132 项前端、76 项后端测试通过，TypeScript 和修改页 WXML/WXSS 编译通过。通过当前局域网 API，合成包装 32/48/64 请求约 800/188/304ms；最终重启后的浅色细线夹具约 777/212/358ms（各轮首请求含启动热身），均包含两张 PNG。图案 PNG 已检查，连续线和透明孔保留。可用 `backend/scripts/verify_perler_quality.py --api-url http://电脑局域网IP:8000 --output-dir test-results/perler-detail --style realistic --sample lineart` 复验。这些是电脑合成测试，不是手机实测；未收到截图对应原始 RGBA，不能声称实际马头密纹已全部还原。本轮已重启新版后端，手机关闭旧小程序后重新编译预览。手势和抠图链路未改；原抠图带入的底板不会被拼豆算法自行移除。黑色“已连接 / 展开”属于微信真机调试浮窗，不属于项目 UI。

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
├── plugins/        # perler / sticker / pixel-art / lego / cross-stitch 独立插件
└── services/       # 视觉 API 契约与响应校验

backend/
├── app/main.py          # FastAPI 上传接口与安全边界
├── app/segmentation.py  # OpenCV 点提示 GrabCut 管线
├── app/perler.py        # 透明裁切、采样、色卡量化与统计
└── app/paste_plugins/   # 贴纸、像素、平面积木、十字绣生成与图纸
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
