import { clipboardStore } from '../../clipboard/clipboard-store'
import type { CaptureMode } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { SpatialController } from '../../interaction/spatial-controller'
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
import { MockSegmentationAdapter } from '../../vision/segmentation-adapter'
import {
  FallbackSegmentationAdapter,
  RemoteSegmentationAdapter,
} from '../../vision/remote-segmentation-adapter'
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
  : new FallbackSegmentationAdapter(
      new RemoteSegmentationAdapter(APP_CONFIG.VISION_API_BASE_URL),
      mockSegmenter,
    )
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

Page({
  data: {
    mode: 'object' as CaptureMode,
    debugMode: APP_CONFIG.DEBUG_MODE,
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
    pageVisible = true
    spatialController.reset()
    visionGestureAdapter.reset()
    this.setData({
      cursorX: 0.5,
      cursorY: 0.56,
      objectX: 0.5,
      objectY: 0.56,
      gesture: 'HOVERING',
      isGrabbed: false,
      isCopying: false,
      status: '按住目标并拖动',
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
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onUnload() {
    pageVisible = false
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onModeChange(event: { detail: { mode: CaptureMode } }) {
    this.setData({ mode: event.detail.mode, status: '按住目标并拖动' })
  },

  onToggleScene() {
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
    if (!anchor) {
      visionGestureAdapter.reset()
      if (!this.data.isCopying) {
        spatialController.reset()
        this.setData({ isGrabbed: false, gesture: 'IDLE', handStatus: '请将手放入画面' })
      }
      return
    }

    const result = visionGestureAdapter.update(anchor)
    if (!result.hand.detected || this.data.isCopying) return
    const point = result.hand.cursor
    this.setData({ cursorX: point.x, cursorY: point.y, handStatus: '已检测到手部' })

    if (result.pinch === 'PINCH_START') {
      const next = spatialController.start(point)
      this.setData({
        objectX: point.x,
        objectY: point.y,
        gesture: next.gesture,
        isGrabbed: true,
        status: '已抓住 · 移动后松开',
      })
    } else if (result.pinch === 'PINCH_HOLD' && spatialController.isDragging()) {
      const next = spatialController.move(point)
      this.setData({
        objectX: point.x,
        objectY: point.y,
        gesture: next.gesture,
        status: '拖动中 · 松开即复制',
      })
    } else if (result.pinch === 'PINCH_END' && spatialController.isDragging()) {
      this.finishGrab()
    }
  },

  async onTouchStart(event: MiniProgramTouchEvent) {
    if (this.data.isCopying) return
    const touch = event.touches[0]
    if (!touch) return

    const point = this.toNormalizedPoint(touch)
    const hand = await handTracker.processFrame(point)
    const next = spatialController.start(hand.cursor)
    this.setData({
      cursorX: hand.cursor.x,
      cursorY: hand.cursor.y,
      objectX: hand.cursor.x,
      objectY: hand.cursor.y,
      gesture: next.gesture,
      isGrabbed: true,
      status: '已抓住 · 移动后松开',
    })
  },

  onTouchMove(event: MiniProgramTouchEvent) {
    if (!spatialController.isDragging() || this.data.isCopying) return
    const touch = event.touches[0]
    if (!touch) return

    const point = this.toNormalizedPoint(touch)
    const next = spatialController.move(point)
    this.setData({
      cursorX: point.x,
      cursorY: point.y,
      objectX: point.x,
      objectY: point.y,
      gesture: next.gesture,
      status: '拖动中 · 松开即复制',
    })
  },

  async onTouchEnd() {
    if (!spatialController.isDragging() || this.data.isCopying) return
    await this.finishGrab()
  },

  async finishGrab() {
    const point = spatialController.getCursor()
    const next = spatialController.release()

    this.setData({
      gesture: next.gesture,
      isGrabbed: false,
      isCopying: true,
      status: '正在复制现实…',
    })

    const image = await this.captureFramePath()
    const [item] = await Promise.all([
      segmenter.segment({ image, point, mode: this.data.mode }),
      new Promise((resolve) => setTimeout(resolve, APP_CONFIG.COPY_ANIMATION_MS)),
    ])
    clipboardStore.set(item)
    wx.navigateTo({ url: '/pages/clipboard/clipboard' })
  },

  async captureFramePath(): Promise<string> {
    if (!this.data.useMockScene && frameCapture) {
      try {
        return await frameCapture.capture()
      } catch (error) {
        console.warn('Frame capture unavailable, using demo content', error)
      }
    }
    return latestFrame ? 'camera://latest-frame' : 'mock://camera-frame'
  },

  onTouchCancel() {
    this.onTouchEnd()
  },

  toNormalizedPoint(touch: MiniProgramTouch) {
    const system = wx.getWindowInfo()
    return {
      x: Math.max(0, Math.min(1, touch.clientX / system.windowWidth)),
      y: Math.max(0, Math.min(1, touch.clientY / system.windowHeight)),
    }
  },
})
