import type { VisionKitHandAnchor } from './visionkit-hand-tracker';

export type VisionKitFrame = unknown;

export type VisionKitCanvas = {
  width: number;
  height: number;
};

export type VisionKitFrameRenderer = {
  gl?: unknown;
  render(frame: VisionKitFrame): void;
  dispose(): void;
};

export type VisionKitSessionLike = {
  start(callback: (error?: unknown) => void): void;
  stop?(): void;
  on(event: 'addAnchors' | 'updateAnchors' | 'removeAnchors', callback: (anchors: VisionKitHandAnchor[]) => void): void;
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  getVKFrame(width: number, height: number): VisionKitFrame | undefined;
};

export type VisionKitSessionOptions = {
  track: { plane: { mode: 1 }; hand: { mode: 1 } };
  version: 'v1';
  gl: unknown;
};

export type VisionKitSessionHandlers = {
  onHand(anchor?: VisionKitHandAnchor): void;
  onReady(): void;
  onError(error: unknown): void;
};

type SessionFactory = (options: VisionKitSessionOptions) => VisionKitSessionLike;

/**
 * Minimal VKSession lifecycle adapted from Tencent's MIT-licensed mini program demo.
 * Source: https://github.com/wechat-miniprogram/miniprogram-demo/tree/master/miniprogram/packageAPI/pages/ar/hand-detect
 */
export class VisionKitHandSession {
  private session?: VisionKitSessionLike;
  private renderer?: VisionKitFrameRenderer;
  private running = false;
  private lastFrameAt = 0;

  constructor(
    private readonly createSession: SessionFactory = (options) => wx.createVKSession(options),
    private readonly fps = 30,
  ) {}

  start(
    canvas: VisionKitCanvas,
    renderer: VisionKitFrameRenderer,
    handlers: VisionKitSessionHandlers,
  ): void {
    this.stop();
    this.renderer = renderer;
    this.running = true;
    this.lastFrameAt = 0;

    try {
      const session = this.createSession({
        track: { plane: { mode: 1 }, hand: { mode: 1 } },
        version: 'v1',
        gl: renderer.gl,
      });
      this.session = session;

      session.on('addAnchors', (anchors) => this.forwardFirstAnchor(anchors, handlers));
      session.on('updateAnchors', (anchors) => this.forwardFirstAnchor(anchors, handlers));
      session.on('removeAnchors', () => {
        if (this.running) handlers.onHand(undefined);
      });

      session.start((error) => {
        if (!this.running) return;
        if (error) {
          this.running = false;
          handlers.onError(error);
          return;
        }

        handlers.onReady();
        session.requestAnimationFrame((timestamp) => this.onFrame(timestamp, canvas));
      });
    } catch (error) {
      this.running = false;
      handlers.onError(error);
    }
  }

  stop(): void {
    this.running = false;
    this.session?.stop?.();
    this.renderer?.dispose();
    this.session = undefined;
    this.renderer = undefined;
  }

  private forwardFirstAnchor(
    anchors: VisionKitHandAnchor[],
    handlers: VisionKitSessionHandlers,
  ): void {
    if (this.running) handlers.onHand(anchors[0]);
  }

  private onFrame(timestamp: number, canvas: VisionKitCanvas): void {
    if (!this.running || !this.session || !this.renderer) return;

    const interval = 1000 / this.fps;
    if (timestamp - this.lastFrameAt >= interval) {
      this.lastFrameAt = timestamp;
      const frame = this.session.getVKFrame(canvas.width, canvas.height);
      if (frame) this.renderer.render(frame);
    }

    this.session.requestAnimationFrame((nextTimestamp) => this.onFrame(nextTimestamp, canvas));
  }
}
