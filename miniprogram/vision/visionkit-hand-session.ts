import { isVisionKitHandAnchor, type VisionKitHandAnchor } from './visionkit-hand-tracker';
import { GESTURE_CONFIG } from './gesture-config';

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
  destroy?(): void;
  cancelAnimationFrame?(id: number): void;
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
  onHand(anchor?: VisionKitHandAnchor, observation?: { receivedAt: number }): void;
  onFrame?(receivedAt: number, cameraTimestampNs?: number): void;
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
  private generation = 0;
  private animationFrame?: number;
  private handlers?: VisionKitSessionHandlers;
  private activeHandId?: number;

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
    const generation = this.generation;
    this.renderer = renderer;
    this.handlers = handlers;
    this.running = true;
    this.lastFrameAt = 0;

    try {
      const session = this.createSession({
        track: { plane: { mode: 1 }, hand: { mode: 1 } },
        version: 'v1',
        gl: renderer.gl,
      });
      this.session = session;

      session.on('addAnchors', (anchors) => this.forwardFirstAnchor(anchors, handlers, generation));
      session.on('updateAnchors', (anchors) => this.forwardFirstAnchor(anchors, handlers, generation));
      session.on('removeAnchors', (anchors) => {
        if (!this.running || generation !== this.generation || !Array.isArray(anchors)) return;
        const removedActive = anchors.some(anchor => anchor && (
          this.activeHandId !== undefined ? anchor.id === this.activeHandId : anchor.type === 7 || isVisionKitHandAnchor(anchor)));
        if (anchors.length === 0 || removedActive) {
          this.activeHandId = undefined;
          handlers.onHand(undefined, { receivedAt: Date.now() });
        }
      });

      session.start((error) => {
        if (!this.running || generation !== this.generation) return;
        if (error) {
          this.fail(error);
          return;
        }

        handlers.onReady();
        if (this.running && generation === this.generation) this.animationFrame = session.requestAnimationFrame((timestamp) => this.onFrame(timestamp, canvas, generation));
      });
    } catch (error) {
      this.fail(error);
    }
  }

  stop(): void {
    this.generation++;
    this.running = false;
    const session = this.session;
    const renderer = this.renderer;
    const animationFrame = this.animationFrame;
    this.session = undefined;
    this.renderer = undefined;
    this.handlers = undefined;
    this.activeHandId = undefined;
    this.animationFrame = undefined;
    // Official release APIs: https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts
    // Every resource is released even if one native cleanup method fails.
    for (const release of [
      () => { if (animationFrame !== undefined) session?.cancelAnimationFrame?.(animationFrame); },
      () => session?.stop?.(),
      () => renderer?.dispose(),
      () => session?.destroy?.(),
    ]) {
      try { release(); } catch (error) { console.warn('VisionKit cleanup failed', error); }
    }
  }

  private fail(error: unknown): void {
    const handlers = this.handlers;
    this.stop();
    handlers?.onError(error);
  }

  private forwardFirstAnchor(
    anchors: VisionKitHandAnchor[],
    handlers: VisionKitSessionHandlers,
    generation: number,
  ): void {
    if (!this.running || generation !== this.generation || !Array.isArray(anchors)) return;
    const anchor = anchors.find(value => isVisionKitHandAnchor(value) && value.id === this.activeHandId)
      ?? anchors.find(isVisionKitHandAnchor);
    // An unrelated plane update must not clear a still-tracked hand.
    if (!anchor && anchors.length > 0) return;
    this.activeHandId = anchor?.id;
    handlers.onHand(anchor, { receivedAt: Date.now() });
  }

  private onFrame(timestamp: number, canvas: VisionKitCanvas, generation: number): void {
    if (!this.running || generation !== this.generation || !this.session || !this.renderer) return;

    this.animationFrame = undefined;
    try {
      const interval = 1000 / this.fps;
      if (timestamp - this.lastFrameAt >= interval) {
        this.lastFrameAt = GESTURE_CONFIG.useFrameCadenceCompensation
          ? timestamp - (timestamp - this.lastFrameAt) % interval : timestamp;
        const frame = this.session.getVKFrame(canvas.width, canvas.height);
        if (frame) {
          this.renderer.render(frame);
          const sourceTimestamp = (frame as { timestamp?: unknown }).timestamp;
          this.handlers?.onFrame?.(Date.now(), typeof sourceTimestamp === 'number' && Number.isFinite(sourceTimestamp) ? sourceTimestamp : undefined);
        }
      }
      if (this.running && generation === this.generation && this.session) this.animationFrame = this.session.requestAnimationFrame((nextTimestamp) => this.onFrame(nextTimestamp, canvas, generation));
    } catch (error) { this.fail(error); }
  }
}
