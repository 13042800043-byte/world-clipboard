import { clipboardStore } from '../../clipboard/clipboard-store'
import type { CaptureMode } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { getDeviceLayout } from '../../utils/device-layout'
import { SpatialController } from '../../interaction/spatial-controller'
import { shouldRenderSpatialFrame } from '../../interaction/spatial-render-scheduler'
import {
  WeChatCameraFrameSource,
  type CameraFrame,
} from '../../vision/camera-frame-source'
import {
  CameraPhotoCapture,
  VisionKitCanvasCapture,
  type FrameCapture,
} from '../../vision/frame-capture'
import { MockHandTracker } from '../../vision/hand-tracker'
import type { NormalizedPoint } from '../../vision/hand-tracker'
import { CoordinateTransform, orientedDimensions } from '../../vision/coordinate-transform'
import { VISION_CONFIG } from '../../vision/vision-config'
import { CUTOUT_CONFIG } from '../../vision/cutout-config'
import { FinalCaptureController, type FinalCaptureInput, type FinalPhoto } from '../../vision/final-capture-controller'
import { FinalSegmentationController } from '../../vision/final-segmentation-controller'
import { PhotoColorCapture } from '../../vision/photo-color-capture'
import { buildHandNegativePrompt } from '../../vision/hand-negative-prompt'
import { HoverSelectionController } from '../../vision/hover-selection-controller'
import { MockSegmentationAdapter } from '../../vision/segmentation-adapter'
import { RemoteSegmentationAdapter } from '../../vision/remote-segmentation-adapter'
import { createVisionKitCameraRenderer } from '../../vision/visionkit-camera-renderer'
import { VisionKitHandSession } from '../../vision/visionkit-hand-session'
import {
  VisionKitHandGestureAdapter,
  type VisionKitHandAnchor,
} from '../../vision/visionkit-hand-tracker'

const spatialController = new SpatialController()
const handTracker = new MockHandTracker()
const mockSegmenter = new MockSegmentationAdapter()
const segmenter = APP_CONFIG.USE_MOCK_SEGMENTATION
  ? mockSegmenter
  : new RemoteSegmentationAdapter(APP_CONFIG.VISION_API_BASE_URL)
const visionGestureAdapter = new VisionKitHandGestureAdapter()
const finalSegmenter = new FinalSegmentationController(segmenter)
const colorCapture = new PhotoColorCapture()
const visionSession = new VisionKitHandSession(
  (options) => wx.createVKSession(options),
  APP_CONFIG.VISIONKIT_FPS,
)
const frameSource = new WeChatCameraFrameSource(
  () => wx.createCameraContext(),
  APP_CONFIG.CAMERA_FRAME_INTERVAL_MS,
)
let latestFrame: CameraFrame | undefined
let acceptedFrameCount = 0
let visionKitStarting = false
let visionStartGeneration = 0
let visionUnavailable = false
let visionStartTimeout: ReturnType<typeof setTimeout> | undefined
let pageVisible = false
let frameCapture: FrameCapture | undefined
let lastSpatialRenderAt = 0
let handExpiryTimer: ReturnType<typeof setTimeout> | undefined
let touchActive = false
let captureGeneration = 0
type SelectionCapture = FinalPhoto
let grabbedFrame: Promise<{ capture?: SelectionCapture; error?: Error }> | undefined
let finalCapturePending = false
let resumingAfterCapture = false
let photoLease: number | undefined
let leasedFromVisionKit = false
let resumeOnNextHand = false
let captureHandTimer: ReturnType<typeof setTimeout> | undefined
let photoReady: { resolve(): void; reject(error: Error): void } | undefined
let lastLandmarks: NormalizedPoint[] = []
let recaptureFinal: (() => Promise<FinalPhoto>) | undefined
let hoverSelection: HoverSelectionController | undefined
let motionSample: { point: NormalizedPoint; wrist?: NormalizedPoint; at: number } | undefined
let cursorVelocity = 0
let handVelocity = 0

Page({
  data: {
    mode: 'object' as CaptureMode,
    debugMode: APP_CONFIG.DEBUG_MODE,
    showDebugControls: APP_CONFIG.SHOW_DEBUG_CONTROLS,
    navTop: 24,
    navHeight: 68,
    navRightInset: 106,
    bottomInset: 0,
    coordinateDebug: APP_CONFIG.DEBUG_MODE && VISION_CONFIG.showCoordinateDebug,
    rawCursorX: 0.5,
    rawCursorY: 0.56,
    selectionX: 0.5,
    selectionY: 0.56,
    debugGesture: '',
    debugPoint: '',
    debugFrame: '',
    debugFrameWidth: 1,
    debugFrameHeight: 1,
    framePointX: 0.5,
    framePointY: 0.56,
    useVisionKit: !APP_CONFIG.USE_MOCK_HAND_TRACKING,
    visionCanvasMounted: true,
    useMockScene: false,
    cameraReady: false,
    handDetected: false,
    cameraError: '',
    frameStatus: '等待实时画面',
    handStatus: 'VisionKit 初始化中…',
    cursorX: 0.5,
    cursorY: 0.56,
    objectX: 0.5,
    objectY: 0.56,
    gesture: 'HOVERING',
    isGrabbed: false,
    isCopying: false,
    status: '按住目标并拖动',
    finalCapturing: false,
    candidateOutline: '',
  },

  onShow() {
    this.setData(getDeviceLayout())
    wx.setNavigationBarColor?.({ frontColor: '#ffffff', backgroundColor: '#17191a' })
    this.cancelInteraction()
    pageVisible = true
    if (visionUnavailable && !APP_CONFIG.USE_MOCK_HAND_TRACKING && !this.data.useMockScene) {
      visionUnavailable = false
      this.setData({ useVisionKit: true, cameraReady: false })
    }
    lastSpatialRenderAt = 0
    this.setData({
      cursorX: 0.5,
      cursorY: 0.56,
      objectX: 0.5,
      objectY: 0.56,
      gesture: 'HOVERING',
      isGrabbed: false,
      isCopying: false,
      handDetected: false,
      status: this.data.useVisionKit ? '将手放入画面 · 食指对准目标' : '按住目标并拖动',
      debugFrame: '',
      debugGesture: '',
      debugPoint: '',
    })
    if (this.data.useVisionKit && !this.data.useMockScene) {
      // Returning from Clipboard must not reuse a disposed VK WebGL surface.
      this.setData({ visionCanvasMounted: false })
      const showGeneration = ++visionStartGeneration
      wx.nextTick(() => {
        if (!pageVisible || showGeneration !== visionStartGeneration) return
        this.setData({ visionCanvasMounted: true })
        wx.nextTick(() => this.startVisionKit())
      })
    } else if (this.data.cameraReady && !this.data.useMockScene) {
      this.startCameraFrames()
    }
  },

  onReady() {
    if (this.data.useVisionKit && !this.data.useMockScene) this.startVisionKit()
  },

  onHide() {
    pageVisible = false
    this.cancelInteraction()
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onUnload() {
    pageVisible = false
    this.cancelInteraction()
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onModeChange(event: { detail: { mode: CaptureMode } }) {
    if (this.data.isCopying || finalCapturePending) return
    this.cancelInteraction()
    this.setData({ mode: event.detail.mode, isGrabbed: false, gesture: 'HOVERING', status: '按住目标并拖动' })
  },

  onToggleScene() {
    if (this.data.isCopying || finalCapturePending) return
    this.cancelInteraction()
    this.setData({ isGrabbed: false, gesture: 'HOVERING' })
    const useMockScene = !this.data.useMockScene
    if (useMockScene) {
      this.stopCameraFrames()
      this.stopVisionKit()
      this.setData({ useMockScene, handStatus: '触摸调试模式' })
    } else if (!APP_CONFIG.USE_MOCK_HAND_TRACKING) {
      this.setData({ useMockScene, useVisionKit: true, handStatus: 'VisionKit 初始化中…' })
      wx.nextTick(() => this.startVisionKit())
    } else if (this.data.cameraReady) {
      this.setData({ useMockScene })
      this.startCameraFrames()
    } else {
      this.setData({ useMockScene })
    }
  },

  onCameraReady() {
    if (this.data.useVisionKit || this.data.useMockScene) return
    frameCapture = new CameraPhotoCapture()
    if (photoReady) {
      this.setData({ cameraReady: true, cameraError: '' })
      photoReady.resolve()
      return
    }
    this.setData({ cameraReady: true, cameraError: '', handStatus: '实时画面 · 触摸调试' })
    if (!this.data.useMockScene) this.startCameraFrames()
  },

  onCameraError(event: { detail?: { errMsg?: string } }) {
    if (this.data.useVisionKit || this.data.useMockScene) return
    if (finalCapturePending) {
      photoReady?.reject(new Error(event.detail?.errMsg || '高清相机初始化失败'))
      this.setData({ cameraError: event.detail?.errMsg || '高清相机暂不可用' })
      return
    }
    this.stopCameraFrames()
    this.setData({
      cameraReady: false,
      cameraError: event.detail?.errMsg || '摄像头暂不可用',
      useMockScene: true,
      frameStatus: '已切换 Mock 画面',
      handStatus: '已切换 Mock 画面',
    })
  },

  startCameraFrames() {
    acceptedFrameCount = 0
    try {
      frameSource.start((frame) => {
        latestFrame = frame
        acceptedFrameCount += 1
        if (acceptedFrameCount === 1 || acceptedFrameCount % 8 === 0) {
          this.setData({
            frameStatus: `实时帧 ${frame.width} × ${frame.height}`,
            handStatus: `实时画面 ${frame.width} × ${frame.height} · 触摸调试`,
          })
        }
      })
    } catch {
      this.setData({ frameStatus: '实时帧需使用真机调试', handStatus: '摄像头 · 触摸调试' })
    }
  },

  stopCameraFrames() {
    frameSource.stop()
    latestFrame = undefined
  },

  startVisionKit() {
    if (visionKitStarting || !pageVisible || this.data.useMockScene || !this.data.useVisionKit || !this.data.visionCanvasMounted) return
    const startGeneration = ++visionStartGeneration
    visionKitStarting = true
    visionStartTimeout = setTimeout(() => {
      if (startGeneration === visionStartGeneration && pageVisible) this.fallbackToCamera(new Error('VisionKit 启动超时'))
    }, CUTOUT_CONFIG.CAMERA_READY_TIMEOUT_MS)
    this.setData({ handStatus: 'VisionKit 初始化中…' })

    wx.createSelectorQuery()
      .select('#visionkit-canvas')
      .node()
      .exec((result) => {
        if (startGeneration !== visionStartGeneration || !pageVisible || this.data.useMockScene || !this.data.useVisionKit) return
        const canvas = result[0]?.node
        if (!canvas) {
          visionKitStarting = false
          this.fallbackToCamera(new Error('VisionKit canvas unavailable'))
          return
        }

        try {
          const windowInfo = wx.getWindowInfo()
          const pixelRatio = windowInfo.pixelRatio || 1
          canvas.width = Math.round(windowInfo.windowWidth * pixelRatio)
          canvas.height = Math.round(windowInfo.windowHeight * pixelRatio)
          frameCapture = new VisionKitCanvasCapture(canvas)
          const renderer = createVisionKitCameraRenderer(canvas)

          visionSession.start(canvas, renderer, {
            onHand: (anchor) => this.onVisionHand(anchor),
            onReady: () => {
              if (startGeneration !== visionStartGeneration || !pageVisible) return
              if (visionStartTimeout) clearTimeout(visionStartTimeout)
              visionStartTimeout = undefined
              visionKitStarting = false
              if (resumingAfterCapture) {
                finalCapturePending = false
                resumingAfterCapture = false
                this.setData({ finalCapturing: false })
                if (!touchActive && spatialController.isDragging()) {
                  resumeOnNextHand = true
                  captureHandTimer = setTimeout(() => {
                    resumeOnNextHand = false
                    captureHandTimer = undefined
                    this.onVisionHand()
                  }, CUTOUT_CONFIG.HAND_REACQUIRE_TIMEOUT_MS)
                }
              }
              this.setData({ cameraReady: true, cameraError: '', handStatus: '请将手放入画面' })
            },
            onError: (error) => {
              if (startGeneration !== visionStartGeneration || !pageVisible) return
              visionKitStarting = false
              this.fallbackToCamera(error)
            },
          })
        } catch (error) {
          visionKitStarting = false
          this.fallbackToCamera(error)
        }
      })
  },

  stopVisionKit() {
    visionStartGeneration++
    if (captureHandTimer) clearTimeout(captureHandTimer)
    captureHandTimer = undefined
    resumeOnNextHand = false
    if (visionStartTimeout) clearTimeout(visionStartTimeout)
    visionStartTimeout = undefined
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    visionKitStarting = false
    visionGestureAdapter.reset()
    visionSession.stop()
    frameCapture = undefined
  },

  fallbackToCamera(error: unknown) {
    visionUnavailable = true
    finalCapturePending = false
    resumingAfterCapture = false
    this.stopVisionKit()
    if (spatialController.isDragging()) {
      captureGeneration++
      spatialController.reset()
      grabbedFrame = undefined
    }
    console.warn('VisionKit unavailable, falling back to Camera API', error)
    this.setData({
      useVisionKit: false,
      cameraReady: false,
      handStatus: 'VisionKit 不可用 · 触摸调试',
      status: '手势相机暂不可用 · 可按住屏幕抓取',
      finalCapturing: false,
      isGrabbed: false,
      handDetected: false,
    })
  },

  onVisionHand(anchor?: VisionKitHandAnchor) {
    if (!pageVisible || touchActive || this.data.isCopying || finalCapturePending) return
    const windowInfo = wx.getWindowInfo()
    const now = Date.now()
    if (resumeOnNextHand) {
      if (!anchor || anchor.points.length < 21 || !anchor.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return
      resumeOnNextHand = false
      if (captureHandTimer) clearTimeout(captureHandTimer)
      captureHandTimer = undefined
      visionGestureAdapter.resumeAfterCapture(now - 1)
    }
    const result = visionGestureAdapter.update(anchor, false, now, windowInfo.windowWidth / windowInfo.windowHeight)
    if (result.tracking === 'grace') {
      this.setData({ handStatus: '跟踪短暂中断 · 保持抓取', debugGesture: 'TRACKING_LOST · grace' })
      return
    }
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    if (result.tracking === 'lost' || result.phase === 'REARMING') {
      captureGeneration += 1
      spatialController.reset()
      grabbedFrame = undefined
      hoverSelection?.reset()
      this.setData({ candidateOutline: '' })
      this.setData({ isGrabbed: false, handDetected: result.tracking !== 'lost', gesture: 'IDLE', handStatus: result.phase === 'REARMING' ? '先张开两指，再重新抓取' : '请将手放入画面', status: result.phase === 'REARMING' ? '先张开两指，再重新抓取' : '将手放入画面 · 食指对准目标', debugGesture: result.phase })
      if (result.tracking === 'lost') return
    }
    handExpiryTimer = setTimeout(() => this.onVisionHand(), VISION_CONFIG.trackingLostGraceMs + 1)
    if (result.phase === 'REARMING') return
    if (!this.data.handDetected) this.setData({ handDetected: true })
    const point = result.hand.cursor
    lastLandmarks = result.hand.landmarks
    const wrist = lastLandmarks[0]
    if (motionSample && now > motionSample.at) {
      const seconds = (now - motionSample.at) / 1000
      cursorVelocity = Math.hypot(point.x - motionSample.point.x, point.y - motionSample.point.y) / seconds
      handVelocity = wrist && motionSample.wrist ? Math.hypot(wrist.x - motionSample.wrist.x, wrist.y - motionSample.wrist.y) / seconds : 0
    }
    motionSample = { point: { ...point }, wrist: wrist && { ...wrist }, at: now }
    const forceRender = result.pinch === 'PINCH_START' || result.pinch === 'PINCH_END'
    const shouldRender = shouldRenderSpatialFrame(
      lastSpatialRenderAt,
      now,
      1000 / APP_CONFIG.SPATIAL_UI_FPS,
      forceRender,
    )
    const renderDebug = {
      rawCursorX: result.rawCursor?.x ?? point.x,
      rawCursorY: result.rawCursor?.y ?? point.y,
      debugGesture: `${result.phase} · d=${result.hand.pinchDistance.toFixed(3)} · close ${result.closedFrames}/${VISION_CONFIG.pinchStartFrames} · open ${result.openFrames}/${VISION_CONFIG.pinchReleaseFrames}`,
    }
    if (shouldRender) lastSpatialRenderAt = now

    if (result.pinch === 'PINCH_START') {
      const selection = result.selectionPoint ?? point
      const next = spatialController.start(point, selection)
      this.beginSelectionCapture(selection)
      this.setData({
        ...renderDebug,
        cursorX: point.x,
        cursorY: point.y,
        objectX: point.x,
        objectY: point.y,
        gesture: next.gesture,
        isGrabbed: true,
        selectionX: selection.x,
        selectionY: selection.y,
        status: '已抓住 · 移动后松开',
      })
    } else if (result.pinch === 'PINCH_HOLD' && spatialController.isDragging()) {
      const next = spatialController.move(point)
      if (shouldRender) {
        this.setData({
          ...renderDebug,
          cursorX: point.x,
          cursorY: point.y,
          objectX: point.x,
          objectY: point.y,
          gesture: next.gesture,
          handStatus: '已检测到手部',
          status: '拖动中 · 张开手指即复制',
        })
      }
    } else if (result.pinch === 'PINCH_END' && spatialController.isDragging()) {
      this.finishGrab()
    } else if (shouldRender) {
      this.updateHoverSelection(point)
      this.setData({
        ...renderDebug,
        cursorX: point.x,
        cursorY: point.y,
        objectX: point.x,
        objectY: point.y,
        handStatus: '已检测到手部',
        gesture: 'HOVERING',
        status: '拇指与食指对捏并保持',
      })
    }
  },

  async onTouchStart(event: MiniProgramTouchEvent) {
    if (this.data.isCopying || touchActive || spatialController.isDragging() || finalCapturePending) return
    const touch = event.touches[0]
    if (!touch) return
    touchActive = true
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    visionGestureAdapter.reset()

    const point = this.toNormalizedPoint(touch)
    const generation = captureGeneration
    const hand = await handTracker.processFrame(point)
    if (!pageVisible || !touchActive || generation !== captureGeneration) return
    const next = spatialController.start(hand.cursor)
    this.beginSelectionCapture(hand.cursor)
    this.setData({
      cursorX: hand.cursor.x,
      cursorY: hand.cursor.y,
      objectX: hand.cursor.x,
      objectY: hand.cursor.y,
      gesture: next.gesture,
      isGrabbed: true,
      selectionX: hand.cursor.x,
      selectionY: hand.cursor.y,
      rawCursorX: hand.cursor.x,
      rawCursorY: hand.cursor.y,
      debugGesture: 'TOUCH · GRABBED',
      status: '已抓住 · 移动后松开',
    })
  },

  onTouchMove(event: MiniProgramTouchEvent) {
    if (!touchActive || !spatialController.isDragging() || this.data.isCopying) return
    const touch = event.touches[0]
    if (!touch) return

    const point = this.toNormalizedPoint(touch)
    const next = spatialController.move(point)
    this.setData({
      cursorX: point.x,
      cursorY: point.y,
      rawCursorX: point.x,
      rawCursorY: point.y,
      objectX: point.x,
      objectY: point.y,
      gesture: next.gesture,
      status: '拖动中 · 松开即复制',
    })
  },

  async onTouchEnd() {
    if (!touchActive || !spatialController.isDragging() || this.data.isCopying) return
    touchActive = false
    await this.finishGrab()
  },

  async finishGrab() {
    if (!spatialController.isDragging() || this.data.isCopying) return
    const generation = captureGeneration
    const selectionFrame = grabbedFrame
    const mode = this.data.mode
    const next = spatialController.release()

    this.setData({
      gesture: next.gesture,
      isGrabbed: false,
      isCopying: true,
      status: mode === 'color' ? '正在复制颜色…' : '正在复制现实…',
    })

    try {
      const result = await selectionFrame
      if (!pageVisible || generation !== captureGeneration) return
      if (!result?.capture) throw result?.error ?? new Error('抓取画面尚未准备好，请重新抓取')
      const [item] = await Promise.all([
        mode === 'color' ? colorCapture.capture(result.capture) : finalSegmenter.segment(result.capture, mode, async () => {
          this.setData({ status: '画面偏糊 · 请稳住手机，自动重拍一次' })
          if (!recaptureFinal) throw new Error('高清相机尚未准备好')
          return recaptureFinal()
        }, this.data.coordinateDebug, () => pageVisible && generation === captureGeneration),
        new Promise((resolve) => setTimeout(resolve, APP_CONFIG.COPY_ANIMATION_MS)),
      ])
      if (!pageVisible || generation !== captureGeneration) return
      clipboardStore.set(item)
      wx.navigateTo({ url: '/pages/clipboard/clipboard' })
    } catch (error) {
      if (!pageVisible || generation !== captureGeneration) return
      console.warn(mode === 'color' ? 'Local color capture failed' : 'Real segmentation failed', error)
      const detail = error instanceof Error ? error.message : '未知错误'
      spatialController.reset()
      hoverSelection?.reset()
      this.setData({
        gesture: 'HOVERING',
        isGrabbed: false,
        isCopying: false,
        status: `${mode === 'color' ? '颜色抓取失败' : '真实抠图失败'} · ${detail}`,
        candidateOutline: '',
      })
      wx.showToast({ title: `抓取失败：${detail}`, icon: 'none', duration: 3600 })
    }
  },

  beginSelectionCapture(selection: NormalizedPoint) {
    const generation = ++captureGeneration
    // Reset the image node before reusing its file path on the next Grab.
    this.setData({ debugFrame: '', debugPoint: '' })
    const windowInfo = wx.getWindowInfo()
    const candidate = hoverSelection?.lock(selection)
    const motionDebug = touchActive ? 'TOUCH' : `cursorV ${cursorVelocity.toFixed(2)} · handV ${handVelocity.toFixed(2)} /s`
    this.setData({ candidateOutline: candidate?.outline ?? '' })
    hoverSelection?.reset()
    const input: FinalCaptureInput = { point: { ...selection }, viewWidth: windowInfo.windowWidth,
      viewHeight: windowInfo.windowHeight, box: candidate?.bbox, negativePoints: CUTOUT_CONFIG.USE_HAND_NEGATIVE_PROMPT
        ? buildHandNegativePrompt(touchActive ? [] : lastLandmarks, selection, candidate?.bbox) : [] }
    const capture = CUTOUT_CONFIG.USE_HIGH_RES_FINAL_CAPTURE ? this.createFinalCapture(generation) : undefined
    recaptureFinal = capture ? () => capture.capture(input) : undefined
    // Tracking frames are selection-only. Final RGB comes from takePhoto high.
    grabbedFrame = (capture ? capture.capture(input) : this.captureSelectionFrame(selection)).then((capture: SelectionCapture) => {
      if (pageVisible && generation === captureGeneration && this.data.coordinateDebug) {
        this.setData({ debugFrame: capture.image, debugFrameWidth: capture.width, debugFrameHeight: capture.height,
          framePointX: capture.point.x, framePointY: capture.point.y,
          debugPoint: `screen ${selection.x.toFixed(3)}, ${selection.y.toFixed(3)} → photo ${capture.point.x.toFixed(3)}, ${capture.point.y.toFixed(3)} · ${capture.width}×${capture.height} · ${motionDebug} · t=${capture.createdAt} · box ${capture.box ? JSON.stringify(capture.box) : 'photo selection fallback'}` })
      }
      return { capture }
    }).catch((error: unknown) => ({ error: error instanceof Error ? error : new Error('画面导出失败') }))
  },

  updateHoverSelection(point: NormalizedPoint) {
    if (!CUTOUT_CONFIG.USE_HOVER_SELECTION || !(segmenter instanceof RemoteSegmentationAdapter) || !this.data.useVisionKit || this.data.mode === 'color') return
    if (!hoverSelection) hoverSelection = new HoverSelectionController(async (selected) => {
      const image = await this.captureFramePath()
      return (segmenter as RemoteSegmentationAdapter).select({ image, point: selected, mode: 'object' })
    })
    const generation = captureGeneration
    void hoverSelection.observe(point).then(() => {
      if (pageVisible && generation === captureGeneration && !spatialController.isDragging() && !this.data.isCopying) {
        const candidate = hoverSelection?.lock(point)
        this.setData({ candidateOutline: candidate?.outline ?? '' })
      }
    })
  },

  createFinalCapture(generation: number): FinalCaptureController {
    const ownedByVisionKit = this.data.useVisionKit
    let prepared = false
    return new FinalCaptureController({
      prepare: async () => {
        if (!pageVisible || generation !== captureGeneration || this.data.useMockScene) throw new Error('请切回 CAMERA 并等待相机就绪')
        if (!ownedByVisionKit) {
          if (!this.data.cameraReady) throw new Error('摄像头尚未准备好')
          prepared = true
          photoLease = generation
          leasedFromVisionKit = false
          finalCapturePending = true
          this.setData({ finalCapturing: true })
          return
        }
        prepared = true
        photoLease = generation
        leasedFromVisionKit = true
        finalCapturePending = true
        resumingAfterCapture = false
        if (handExpiryTimer) clearTimeout(handExpiryTimer)
        handExpiryTimer = undefined
        visionKitStarting = false
        visionStartGeneration++
        if (visionStartTimeout) clearTimeout(visionStartTimeout)
        visionStartTimeout = undefined
        visionSession.stop() // Do not reset the confirmed pinch on an intentional pause.
        frameCapture = undefined
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => photoReady?.reject(new Error('高清相机启动超时，请重新抓取')), CUTOUT_CONFIG.CAMERA_READY_TIMEOUT_MS)
          photoReady = {
            resolve: () => { clearTimeout(timeout); photoReady = undefined; resolve() },
            reject: (error) => { clearTimeout(timeout); photoReady = undefined; reject(error) },
          }
          this.setData({ useVisionKit: false, cameraReady: false, finalCapturing: true,
            status: '已锁定目标 · 稳住手机，正在获取高清画面' })
        })
      },
      capturePhoto: async () => {
        if (!pageVisible || generation !== captureGeneration) throw new Error('抓取已取消')
        const image = await new CameraPhotoCapture(wx.createCameraContext(), 'high').capture()
        const dimensions = orientedDimensions(await new Promise<{ width: number; height: number; orientation?: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('读取高清照片尺寸超时')), 5000)
          wx.getImageInfo({ src: image,
            success: result => { clearTimeout(timeout); resolve(result) },
            fail: () => { clearTimeout(timeout); reject(new Error('无法读取高清照片尺寸')) } })
        }))
        return { image, ...dimensions }
      },
      restore: async () => {
        if (!prepared || photoLease !== generation) return
        photoLease = undefined
        photoReady?.reject(new Error('高清拍照已结束'))
        if (!ownedByVisionKit) {
          finalCapturePending = false
          this.setData({ finalCapturing: false })
          return
        }
        this.stopCameraFrames()
        frameCapture = undefined
        resumingAfterCapture = pageVisible
        finalCapturePending = pageVisible
        this.setData({ useVisionKit: true, cameraReady: false, finalCapturing: pageVisible })
        if (pageVisible) wx.nextTick(() => this.startVisionKit())
      },
    })
  },

  async captureSelectionFrame(selection: NormalizedPoint): Promise<SelectionCapture> {
    const useViewport = this.data.useVisionKit
    const windowInfo = wx.getWindowInfo()
    const image = await this.captureFramePath()
    const dimensions = useViewport ? {
      width: Math.round(windowInfo.windowWidth * (windowInfo.pixelRatio || 1)),
      height: Math.round(windowInfo.windowHeight * (windowInfo.pixelRatio || 1)),
    } : orientedDimensions(await new Promise<{ width: number; height: number; orientation?: string }>((resolve, reject) => {
      // Official signatures: https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts
      wx.getImageInfo({ src: image, success: resolve, fail: () => reject(new Error('无法读取抓取画面尺寸')) })
    }))
    const transform = new CoordinateTransform({ viewWidth: windowInfo.windowWidth, viewHeight: windowInfo.windowHeight,
      frameWidth: dimensions.width, frameHeight: dimensions.height, source: useViewport ? 'viewport' : 'sensor' })
    return { image, point: transform.screenToFrame(selection), ...dimensions, negativePoints: [], createdAt: Date.now() }
  },

  cancelInteraction() {
    if (captureHandTimer) clearTimeout(captureHandTimer)
    captureHandTimer = undefined
    resumeOnNextHand = false
    photoReady?.reject(new Error('抓取已取消'))
    const cancelledVisionPhoto = photoLease !== undefined && leasedFromVisionKit
    photoLease = undefined
    finalCapturePending = false
    resumingAfterCapture = false
    this.setData({ finalCapturing: false,
      handDetected: false,
      ...(cancelledVisionPhoto ? { useVisionKit: true, cameraReady: false } : {}) })
    recaptureFinal = undefined
    lastLandmarks = []
    motionSample = undefined
    hoverSelection?.reset()
    this.setData({ candidateOutline: '' })
    captureGeneration += 1
    grabbedFrame = undefined
    touchActive = false
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    spatialController.reset()
    visionGestureAdapter.reset()
    if (cancelledVisionPhoto && pageVisible && !this.data.useMockScene) wx.nextTick(() => this.startVisionKit())
  },

  async captureFramePath(): Promise<string> {
    if (this.data.useMockScene) {
      throw new Error('当前为 MOCK 画面，请切回 CAMERA')
    }
    if (!frameCapture) {
      throw new Error('摄像头画面尚未准备好')
    }
    try {
      return await frameCapture.capture()
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知平台错误'
      throw new Error(`画面导出失败：${detail}`)
    }
  },

  onTouchCancel() {
    if (!touchActive) return
    this.cancelInteraction()
    this.setData({ isGrabbed: false, gesture: 'IDLE', status: '抓取已取消 · 请重新对准' })
  },

  toNormalizedPoint(touch: MiniProgramTouch) {
    const system = wx.getWindowInfo()
    return {
      x: Math.max(0, Math.min(1, touch.clientX / system.windowWidth)),
      y: Math.max(0, Math.min(1, touch.clientY / system.windowHeight)),
    }
  },
})
