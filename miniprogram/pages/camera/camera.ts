import { clipboardStore } from '../../clipboard/clipboard-store'
import type { CaptureMode } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { SpatialController } from '../../interaction/spatial-controller'
import { MockHandTracker } from '../../vision/hand-tracker'
import { MockSegmentationAdapter } from '../../vision/segmentation-adapter'

const spatialController = new SpatialController()
const handTracker = new MockHandTracker()
const segmenter = new MockSegmentationAdapter()

Page({
  data: {
    mode: 'object' as CaptureMode,
    debugMode: APP_CONFIG.DEBUG_MODE,
    useMockScene: APP_CONFIG.USE_MOCK_HAND_TRACKING,
    cameraReady: false,
    cameraError: '',
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
    spatialController.reset()
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
  },

  onModeChange(event: { detail: { mode: CaptureMode } }) {
    this.setData({ mode: event.detail.mode, status: '按住目标并拖动' })
  },

  onToggleScene() {
    this.setData({ useMockScene: !this.data.useMockScene })
  },

  onCameraReady() {
    this.setData({ cameraReady: true, cameraError: '' })
  },

  onCameraError(event: { detail?: { errMsg?: string } }) {
    this.setData({
      cameraReady: false,
      cameraError: event.detail?.errMsg || '摄像头暂不可用',
      useMockScene: true,
    })
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
    const point = spatialController.getCursor()
    const next = spatialController.release()

    this.setData({
      gesture: next.gesture,
      isGrabbed: false,
      isCopying: true,
      status: '正在复制现实…',
    })

    const item = await segmenter.segment({
      image: 'mock://camera-frame',
      point,
      mode: this.data.mode,
    })
    clipboardStore.set(item)

    setTimeout(() => {
      wx.navigateTo({ url: '/pages/clipboard/clipboard' })
    }, APP_CONFIG.COPY_ANIMATION_MS)
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
