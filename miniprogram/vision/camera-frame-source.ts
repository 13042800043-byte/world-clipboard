export type CameraFrame = {
  data: ArrayBuffer
  width: number
  height: number
}

export type CameraFrameListener = {
  start(): void
  stop(): void
}

export type CameraContextLike = {
  onCameraFrame(callback: (frame: CameraFrame) => void): CameraFrameListener
}

type CreateCameraContext = () => CameraContextLike

export function shouldAcceptCameraFrame(
  lastAcceptedAt: number | undefined,
  now: number,
  minimumIntervalMs: number,
): boolean {
  return lastAcceptedAt === undefined || now - lastAcceptedAt >= minimumIntervalMs
}

export class WeChatCameraFrameSource {
  private listener?: CameraFrameListener
  private lastAcceptedAt?: number

  constructor(
    private readonly createContext: CreateCameraContext = () => wx.createCameraContext(),
    private readonly minimumIntervalMs = 120,
    private readonly now: () => number = Date.now,
  ) {}

  start(onFrame: (frame: CameraFrame) => void): void {
    this.stop()
    const context = this.createContext()
    this.listener = context.onCameraFrame((frame) => {
      const timestamp = this.now()
      if (!shouldAcceptCameraFrame(this.lastAcceptedAt, timestamp, this.minimumIntervalMs)) return
      this.lastAcceptedAt = timestamp
      onFrame(frame)
    })
    this.listener.start()
  }

  stop(): void {
    this.listener?.stop()
    this.listener = undefined
    this.lastAcceptedAt = undefined
  }
}
