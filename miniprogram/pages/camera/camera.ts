import { clipboardStore } from '../../clipboard/clipboard-store'
import type { CaptureMode } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
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
let pageVisible = false
let frameCapture: FrameCapture | undefined
let lastSpatialRenderAt = 0
let handExpiryTimer: ReturnType<typeof setTimeout> | undefined
let touchActive = false
let captureGeneration = 0
type SelectionCapture = { image: string; point: NormalizedPoint; width: number; height: number }
let grabbedFrame: Promise<{ capture?: SelectionCapture; error?: Error }> | undefined

Page({
  data: {
    mode: 'object' as CaptureMode,
    debugMode: APP_CONFIG.DEBUG_MODE,
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
    useMockScene: false,
    cameraReady: false,
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
  },

  onShow() {
    this.cancelInteraction()
    pageVisible = true
    lastSpatialRenderAt = 0
    this.setData({
      cursorX: 0.5,
      cursorY: 0.56,
      objectX: 0.5,
      objectY: 0.56,
      gesture: 'HOVERING',
      isGrabbed: false,
      isCopying: false,
      status: '按住目标并拖动',
      debugFrame: '',
      debugGesture: '',
      debugPoint: '',
    })
    if (this.data.useVisionKit && !this.data.useMockScene) {
      wx.nextTick(() => this.startVisionKit())
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
    if (this.data.isCopying) return
    this.cancelInteraction()
    this.setData({ mode: event.detail.mode, isGrabbed: false, gesture: 'HOVERING', status: '按住目标并拖动' })
  },

  onToggleScene() {
    if (this.data.isCopying) return
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
    frameCapture = new CameraPhotoCapture()
    this.setData({ cameraReady: true, cameraError: '', handStatus: '实时画面 · 触摸调试' })
    if (!this.data.useMockScene) this.startCameraFrames()
  },

  onCameraError(event: { detail?: { errMsg?: string } }) {
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
    if (visionKitStarting || !pageVisible || this.data.useMockScene || !this.data.useVisionKit) return
    visionKitStarting = true
    this.setData({ handStatus: 'VisionKit 初始化中…' })

    wx.createSelectorQuery()
      .select('#visionkit-canvas')
      .node()
      .exec((result) => {
        if (!pageVisible || this.data.useMockScene || !this.data.useVisionKit) {
          visionKitStarting = false
          return
        }
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
              visionKitStarting = false
              this.setData({ cameraReady: true, cameraError: '', handStatus: '请将手放入画面' })
            },
            onError: (error) => {
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
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    visionKitStarting = false
    visionGestureAdapter.reset()
    visionSession.stop()
    frameCapture = undefined
  },

  fallbackToCamera(error: unknown) {
    this.stopVisionKit()
    console.warn('VisionKit unavailable, falling back to Camera API', error)
    this.setData({
      useVisionKit: false,
      cameraReady: false,
      handStatus: 'VisionKit 不可用 · 触摸调试',
      status: '按住目标并拖动',
    })
  },

  onVisionHand(anchor?: VisionKitHandAnchor) {
    if (!pageVisible || touchActive || this.data.isCopying) return
    const windowInfo = wx.getWindowInfo()
    const now = Date.now()
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
      this.setData({ isGrabbed: false, gesture: 'IDLE', handStatus: result.phase === 'REARMING' ? '先张开两指，再重新抓取' : '请将手放入画面', debugGesture: result.phase })
      if (result.tracking === 'lost') return
    }
    handExpiryTimer = setTimeout(() => this.onVisionHand(), VISION_CONFIG.trackingLostGraceMs + 1)
    if (result.phase === 'REARMING') return
    const point = result.hand.cursor
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
    if (this.data.isCopying || touchActive || spatialController.isDragging()) return
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
      status: '正在复制现实…',
    })

    try {
      const result = await selectionFrame
      if (!pageVisible || generation !== captureGeneration) return
      if (!result?.capture) throw result?.error ?? new Error('抓取画面尚未准备好，请重新抓取')
      const { image, point } = result.capture
      const [item] = await Promise.all([
        segmenter.segment({ image, point, mode }),
        new Promise((resolve) => setTimeout(resolve, APP_CONFIG.COPY_ANIMATION_MS)),
      ])
      if (!pageVisible || generation !== captureGeneration) return
      clipboardStore.set(item)
      wx.navigateTo({ url: '/pages/clipboard/clipboard' })
    } catch (error) {
      if (!pageVisible || generation !== captureGeneration) return
      console.warn('Real segmentation failed', error)
      const detail = error instanceof Error ? error.message : '未知错误'
      spatialController.reset()
      this.setData({
        gesture: 'HOVERING',
        isGrabbed: false,
        isCopying: false,
        status: `真实抠图失败 · ${detail}`,
      })
      wx.showToast({ title: `抓取失败：${detail}`, icon: 'none', duration: 3600 })
    }
  },

  beginSelectionCapture(selection: NormalizedPoint) {
    const generation = ++captureGeneration
    // Reset the image node before reusing its file path on the next Grab.
    this.setData({ debugFrame: '', debugPoint: '' })
    // Export immediately on Grab, not on Release after camera/hand movement.
    grabbedFrame = this.captureSelectionFrame(selection).then((capture: SelectionCapture) => {
      if (pageVisible && generation === captureGeneration && this.data.coordinateDebug) {
        this.setData({ debugFrame: capture.image, debugFrameWidth: capture.width, debugFrameHeight: capture.height,
          framePointX: capture.point.x, framePointY: capture.point.y,
          debugPoint: `screen ${selection.x.toFixed(3)}, ${selection.y.toFixed(3)} → frame ${capture.point.x.toFixed(3)}, ${capture.point.y.toFixed(3)} · ${capture.width}×${capture.height}` })
      }
      return { capture }
    }).catch((error: unknown) => ({ error: error instanceof Error ? error : new Error('画面导出失败') }))
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
    return { image, point: transform.screenToFrame(selection), ...dimensions }
  },

  cancelInteraction() {
    captureGeneration += 1
    grabbedFrame = undefined
    touchActive = false
    if (handExpiryTimer) clearTimeout(handExpiryTimer)
    handExpiryTimer = undefined
    spatialController.reset()
    visionGestureAdapter.reset()
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
