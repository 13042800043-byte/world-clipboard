# Gesture Pipeline 第二轮优化与验证

2026-09-13。范围仅为 Hand / Gesture / Spatial Cursor；保留现有 VisionKit、One Euro、Gesture Engine、Interaction State Machine 和 Touch Debug。没有修改 Segmentation、Final Cutout、后端、模型或插件。`project.config.json` 的既有本地修改未纳入本轮提交。

### 光标恢复后 Pinch 不触发修复（10:40）

用户确认食指光标已恢复，但两指捏合不触发。复现两条独立的代码失效路径：①有效手部回调间隔为 125/150/200ms 时，原最大观测间隔 120ms 会让每次闭合确认都重置，Start 和 Release 均无法累计；②同位置/同掌形的 Anchor ID 持续变化时，原逻辑每帧重置 Pinch，光标仍然能够更新。尚未收到手机原生间隔/ID 样本，这两项是可复现的代码问题，不是已确认的手机测量。

stable（及继承它的 responsive/debug）将最大有效观测间隔调至 200ms，仍小于 220ms Hover 丢失宽限；Start/Release 距离阈值及 30ms/两次确认不变。新增可关闭的 `useHandIdContinuity`：仅在 ≤200ms、掌宽比 ≥0.65、0/5/9/17 四个掌部点位移均 ≤较小掌宽的 0.25 时，允许新 native ID 延续同一次手势；明显换位置、换尺度或长时间丢失仍重置。位置重合的两只手不能仅凭此规则可靠区分，当前交互仍以单手为前提。

页面新增“检测到捏合 · 保持片刻”与“两指移入画面中央”提示。`WORLD_CLIPBOARD_HAND` 增加原生 ID、观测间隔、两指尖坐标、掌宽、闭合计数及 Pinch 事件；普通观测最多每两秒记录，阶段变化最多每 250ms 记录，Start/End 单独记录。若真机仍不触发，可据此分清距离阈值未满足、边缘阻断、采样间隔过长和反复重置，避免继续盲调距离。

增加低帧率完整 Start/Hold/End、连续新 ID、异位置换手、过期候选、关闭连续性开关，以及 Camera 页“跟手→捏合提示→Grab→高清拍照启动”回归。正确操作：同一只手伸入镜头视野，食指定位后让拇指与食指的**指尖相碰**；保持到出现“已抓住”，再张开。捏合时尽量让两个指尖和掌部同时可见，不是点击手机屏幕。

验证：全量 212 项前端测试通过，小程序 TypeScript 检查通过。未直接取得手机的 Pinch 距离与原生 ID 记录，真机是否恢复仍需新版预览确认。

### 真机无光标回归修复（10:30）

用户报告相机正常、手移动没有光标。新增页面级回归成功复现：有效 21 点携带 `score=0, confidence=[]` 时，之前默认 0.4 硬门槛令 `handDetected=false`，光标被隐藏。尚未取得该手机的原生 Anchor 样本，不能断言该分数就是实际返回值，但这是上一轮引入的确定性失效路径。

已将 stable/responsive/debug 的 `useConfidenceGate` 默认关闭，恢复按有效关键点跟手，并保留时间确认、归一化、滞回与短时丢失保护。置信度仍采集；待目标设备校准后可显式开启。空、短、非数值置信度数组按“不可用”处理，存在有效总体分数时使用总体分数；完整低分数组在显式开启 gate 后仍受保护。下文最初的“门控开启”记录为第一版实验行为，以本段修正为准。

原生回调增加 Anchor 形状校验，选择实际手部而非固定第一项；其他对象的更新/移除不会清除正在追踪的手；残缺点不再触发 JS 异常。`WORLD_CLIPBOARD_HAND` 日志在 `DEBUG_MODE=true` 时自动输出：会话就绪一次，处理中的观测最多每两秒一次，包含点数、原始 score、置信度数组长度、接受状态、阻断原因和阶段，不记录图像或 21 点内容。无需打开大调试面板即可定位后续真机问题。

增加覆盖：空/短/异常置信度、0 分默认跟手与 Pinch、主动门控低分保护、非手部/损坏数据、混合 Anchor、无关移除和实际 Camera Page 的光标显示/移动/Grab。此前测试大多省略 confidence 或使用 0.9，未覆盖此原生数据兼容性风险。

修复后全量 204 项前端测试与小程序 TypeScript 检查通过；相机正常但无光标的页面级夹具已从失败变为通过。此结果不代替目标手机重新预览验收。本轮不需要重启后端，手部追踪运行在手机 VisionKit 中。

## Current Gesture Pipeline（修改前）

`VisionKit addAnchors/updateAnchors → 21 landmarks → aspect-corrected pinch normalization → One Euro cursor → 2-frame hysteresis → pre-pinch history selection → SpatialController → Camera setData`

- 原生手部追踪：微信 VisionKit `VKSession`，非新增 MediaPipe。4/8 是拇指/食指尖，5/17 是食指/小指 MCP。
- Hover 光标为食指尖；已 Pinch 时切换为两指中点。已有 One Euro，参数 `minCutoff=1.5, beta=8, derivativeCutoff=1`。
- 距离按相机宽高比修正，再除以 5→17 掌宽；掌宽过小时使用已有手框尺度回退。原掌宽未做时间滤波。
- Pinch Start `<0.34`，Release `>0.48`；各需两次观测。已有滞回，但仅按帧确认。
- 丢失宽限 220ms。保存最近 250ms 光标，回看约 100ms、邻近 ±40ms 取中值锁点。
- 既有状态：IDLE → HAND_DETECTED → HOVERING → PINCH_START → GRABBED → DRAGGING → RELEASED。
- 配置相机绘制 24 FPS、空间 UI 20 FPS；它们不是已测得的真机运行 FPS，也不代表模型推理频率。
- 已有 native session generation 防旧会话回调。Anchor 没有与当前图像匹配的源帧时间戳，不能据此宣称已消除所有同会话迟到模型结果。

## Potential Problems（已定位与处理）

| 具体位置 | 原问题 | 本轮处理 |
| --- | --- | --- |
| `vision/gesture-engine.ts` | 相隔 1ms 的两次回调也能确认 Pinch；不同 FPS 下体验不一致 | 时间 + 最少两次有效观测；中断候选重新确认；保留滞回 |
| `vision/visionkit-hand-tracker.ts` | 掌宽自身抖动；Hover/Pinch 光标来源切换；闭合动作污染选点 | 掌宽 One Euro；持续使用食指作跟随基准；候选开始时锁低速历史点 |
| 同上 | 低置信度、边缘、重复回调未区分；抓取中短丢失易取消 | 官方置信度门控；边缘禁止新 Grab、不阻止 Release；300ms 抓取宽限 |
| 同上 `resumeAfterCapture` | 拍照恢复后的新 native hand ID 可能取消原抓取，第一帧引起位置跳变 | 保留手势 session；允许新 native ID；仅一次重定位拖动起点 |
| `interaction/spatial-controller.ts` | 微小 Hold 移动直接变 Drag | 位移超过配置阈值才拖动；锁点保持独立；同 session 不重复启动 |
| `interaction/spatial-render-scheduler.ts` | 24 FPS 观测按 50ms 简单截流，可能只剩约 12 FPS | 保留余下时间，合成输入下恢复约 20 FPS；不排队补播旧点 |
| `vision/visionkit-hand-session.ts` | 60Hz RAF 下同样存在频率向下取整 | 相机绘制也保留节奏余量，目标仍为原配置 24 FPS |
| `pages/camera/camera.wxss` | Hover 目标框 left/top 带 560ms 补间，视觉拖尾 | 位置补间仅用于 Copy 飞行动画 |
| `pages/camera/camera.ts` | 非 Debug 也组装坐标调试字符串；丢失时重复刷新 | 坐标字符串与遥测仅 Debug；面板最多 5Hz；常规光标按原 UI FPS 更新 |

## 配置与回退

唯一调参入口：`miniprogram/vision/gesture-config.ts`。原 `vision-config.ts` 只重新导出配置，原有消费者不必重写。

| 配置 | current（保留对照） | stable（默认） | responsive（实验） |
| --- | --- | --- | --- |
| Cursor One Euro minCutoff / beta / dCutoff | 1.5 / 8 / 1 | 1.5 / 8 / 1 | 1.8 / 10 / 1 |
| Start / Release 归一化阈值 | 0.34 / 0.48 | 不变 | 不变 |
| 确认 | 2 次观测 | ≥30ms 且 ≥2 次 | Start ≥20ms，Release ≥25ms，均 ≥2 次 |
| 丢失宽限：Hover / Grab | 220 / 220ms | 220 / 300ms | 同 stable |
| 掌宽平滑、质量门控、小死区、连续光标、拖动阈值 | 关闭新增行为 | 开启 | 开启 |

`debug` 使用 stable 参数并开启坐标面板。修改 `GESTURE_PROFILE` 后重新编译/生成预览；不是运行时自动调参。`current` 是算法行为对照，不会撤销本轮生命周期 bug 修复与 Copy 专用动画修复。

所有新算法开关集中在 config：`useTimeBasedDebounce`、`usePalmScaleFilter`、`useExtendedGrabGrace`、`useConfidenceGate`、`useEdgeGate`、`useCursorDeadZone`、`useContinuousCursor`、`useDragThreshold`、`useRearmCooldown`、`useStableHistory`、`useObservationGuard`、`useFrameCadenceCompensation`。原 One Euro / selection lock / tracking grace 也可独立切换。归一化不提供关闭开关，避免退回禁止使用的裸像素阈值。

其他初始参数：confidence 0.4；edgeMargin 0.025；cursorDeadZone 0.001；dragActivationDistance 0.012（归一化屏幕位移）；cooldown 80ms；candidate 最大观测间隔 120ms；掌宽滤波 5 / 1 / 1。数字均为待真机比较的初值，不是所有设备的最优值。5→17 掌宽延续现有尺度和阈值；没有在缺少真机样本时换成新的组合尺度。

One Euro 本身已通过速度调节截止频率，不再叠加固定强 EMA。Pinch closing velocity 仅记录，不参与触发；未引入未经验证的速度分类器、自适应阈值或新手势。

## Debug 与 10 秒遥测

1. 将 `GESTURE_PROFILE` 设为 `'debug'`，确保 `miniprogram/config.ts` 的 `DEBUG_MODE=true`。重新编译，再生成手机预览。
2. 橙圈 RAW、绿圈 FILTER、十字 LOCK；白色实际操作光标在确认 Grab 后使用锁点，拖动才相对移动。这几种坐标刻意不混在一起。
3. 面板显示 C/H/U FPS、confidence、两种坐标、速度、raw/filtered 掌宽、raw/normalized pinch、pinch velocity、候选时长、丢失时长、session、锁点及已生效拖动距离。
4. 异常发生后 10 秒内点击「输出最近 10 秒」。微信真机调试 Console 搜索 `WORLD_CLIPBOARD_GESTURE`，复制整条 JSON。按钮吞掉触摸事件，不会触发 Touch Grab。
5. 遥测最多 600 条手势观测和 600 条绘制记录；按最近 10 秒导出，仅含数值，不含图像、21 点数组或后端地址。没有自动上传。普通 stable/responsive 模式不记录，面板关闭。

### 耗时含义与不能测量的部分

- `processingMs.average/p95`：原生回调进入 JS 到滤波/状态处理完成；手机使用 Date.now 毫秒时钟，极短处理可能记录为 0ms。
- `callbackToUiMs.average/p95`：**实际提交 UI 的观测子集**，从回调进入到 `setData` 完成回调；不包括未渲染样本，也不是屏幕光学显示完成时间。
- `pinchConfirmationMs` / `releaseConfirmationMs`：首个候选观测到确认事件；物理动作在两帧之间开始时仍有采样等待。
- C：取出并绘制的 VKFrame 频率，有 timestamp 时去重；H：通过门控的 hand 观测频率，非底层模型运行 FPS；U：空间 UI 更新完成频率，非屏幕刷新率。没有 timestamp 时 C 只是绘制调用频率。
- `VKFrame.timestamp` 是原生纳秒时钟，不能直接减 `Date.now()`。`VKHandAnchor.detectId` 也不是文档承诺的帧时间戳或单调帧序号。
- 因 Anchor 没有可匹配源图像帧，本轮 `cameraToHandMs` / `cameraToUiMs` 明确返回 `null` / 面板 N/A。不能拿最新相机帧与任意 landmark 配对伪造端到端延迟。真正全链路平均/P95 仍需有匹配帧的原生能力，或高帧率外部录像实测。
- 旧 native session 的回调由 generation 拒绝；同会话到达时间倒退/重复观测被忽略，但**不能确认每个同会话 landmark 的真实图像采样时刻**。

## 本机回放结果（不是手机实测）

命令：`npx vitest run tests/miniprogram/gesture-replay.test.ts --silent=false --reporter=verbose`。

输入为确定性合成 21 点、30Hz；静止加入 ±0.004 的周期横向抖动，持续 3s；慢移 0.35 屏宽/3s；快移 0.35 屏宽/400ms。以下取 2026-09-13 10:05 本机一次运行：

| 指标 | current | stable | responsive |
| --- | ---: | ---: | ---: |
| RAW 静止 RMS（屏宽比例） | 0.0028 | 0.0028 | 0.0028 |
| 显示光标静止 RMS | 0.0005 | 0.0000 | 0.0007 |
| 慢移平均等效滤波落后 ms | 65.10 | 65.10 | 53.68 |
| 快移平均等效滤波落后 ms | 25.70 | 25.70 | 21.23 |
| Pinch / Release 候选确认 ms | 33.33 / 33.33 | 33.33 / 33.33 | 33.33 / 33.33 |
| JS update 处理平均 / P95 ms | 0.0531 / 0.1551 | 0.0168 / 0.0280 | 0.0122 / 0.0178 |

stable 的 0 仅代表该合成微抖被死区完全抑制，不是宣称现实中零抖动。等效落后是位置误差除以匀速，不是相机延迟。CPU 时间受 JIT、运行顺序和调度影响，不能据此声称 stable 比 current 快若干倍。默认不贸然改 beta：responsive 在该样本更快，但静止更抖，需手机 A/B 决定。

其余合成验收：20 次近捏合/单帧尖峰序列无误 Start，20 次持续真实阈值捏合全部确认；2s Hold 仅一次 Start；100ms 丢失无 End、恢复保持同 session；闭合食指偏移 0.03 时锁点仍为原 0.5；连续三组 Start/End 的 session 为 1、2、3，无重复/卡死。以上只证明指定输入，不等于现实误触率/漏触率为零。

刷新节奏测试：10s 的 24Hz 手部输入产生约 200 次常规 UI 更新；60Hz RAF 产生约 240 次相机绘制。事件转换允许立即强制渲染，不等待下个限频窗口。

## 验证状态与真机验收

自动回归覆盖原有 Touch、重复进入 Camera、拍照交接、颜色、轮廓和插件测试；本轮全量前端 194 项通过，小程序 TypeScript 检查通过。改动 Camera 页由微信开发者工具附带的原生 WXML/WXSS 编译器检查。未新增依赖。

未直接控制你的手机，没有将真机检查标记为已通过。使用 debug/stable 相同参数，依次测试：

| 场景 | 手机验收 / 数据记录 |
| --- | --- |
| 静止 3s | 查看橙/绿圈差异，记录抖动、有无误 Start |
| 慢移 | 观察有无阶梯，记录 C/H/U FPS |
| 快移 | 观察拖尾、弱置信度、回调→UI 平均/P95 |
| 接近但不捏合 | 做 20 次，记录非预期 Start / 20 |
| 自然捏合 | 做 20 次，记录漏 Start / 20、候选确认平均/P95 |
| Hold 2s | 同 session 仅一次 Start |
| 自然松开 | 可靠 End，记录 releaseConfirmationMs |
| 遮挡约 100ms | 维持抓取、恢复无新 Start；超 300ms 才取消，不自动 Copy |
| 小目标 Pinch | 锁定十字不因合拢漂移；随后大位移能够拖动 |
| 连续三次并往返页面 | session 递增、不重复 Grab、不卡住；拍照后的新 native ID 不中断 |

操作：先让手完整进入画面，食指把白点对准物体；拇指与食指捏合并保持，出现“已抓住”后移动，再自然张开。丢失超时后需先张开两指，再开始下一次抓取。Debug Touch 仍可按住、拖动、松手完成原流程。

## 依据

- [微信官方 API typings：VKHandAnchor / VKFrame / setData](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)：使用真实的 score/confidence 字段；缺失值显示未知，不制造满分置信度；原生帧 timestamp 与回调时钟分开记录。
- [微信官方 Hand Detect 示例](https://github.com/wechat-miniprogram/miniprogram-demo/tree/master/miniprogram/packageAPI/pages/ar/hand-detect)：继续复用已有 VKSession 路径，不引入新模型。
- [One Euro Filter 作者说明](https://gery.casiez.net/1euro/)：低速/高速截止频率随速度变化，沿用现有滤波器与参数基线。
