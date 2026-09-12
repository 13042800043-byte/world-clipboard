import type { SegmentApiSuccess } from '../services/vision-api'
import type { NormalizedPoint } from './hand-tracker'
import { CUTOUT_CONFIG } from './cutout-config'

export type SelectionCandidate = SegmentApiSuccess & { point: NormalizedPoint; createdAt: number }
export class HoverSelectionController {
  private point?: NormalizedPoint
  private stableSince = 0
  private lastRequestAt = -Infinity
  private busy = false
  private epoch = 0
  private candidate?: SelectionCandidate
  constructor(private readonly select: (point: NormalizedPoint) => Promise<SegmentApiSuccess>) {}

  async observe(point: NormalizedPoint, now = Date.now()): Promise<SelectionCandidate | undefined> {
    if (!this.point || Math.hypot(point.x - this.point.x, point.y - this.point.y) > CUTOUT_CONFIG.HOVER_MOVE_THRESHOLD) {
      this.point = { ...point }; this.stableSince = now; this.candidate = undefined; this.epoch++
    }
    if (this.busy || now - this.stableSince < CUTOUT_CONFIG.HOVER_STABILITY_MS || now - this.lastRequestAt < CUTOUT_CONFIG.HOVER_REQUEST_INTERVAL_MS) return this.lock(point, now)
    const epoch = this.epoch
    const selected = { ...point }
    this.busy = true; this.lastRequestAt = now
    try {
      const result = await this.select(selected)
      if (epoch === this.epoch) this.candidate = { ...result, point: selected, createdAt: now }
    } catch {
      // Hover is provisional. Final capture surfaces errors; no false outline.
      if (epoch === this.epoch) this.candidate = undefined
    } finally { this.busy = false }
    return this.lock(point, now)
  }

  lock(point: NormalizedPoint, now = Date.now()): SelectionCandidate | undefined {
    const c = this.candidate
    if (!c || now - c.createdAt > CUTOUT_CONFIG.CANDIDATE_MAX_AGE_MS || Math.hypot(point.x - c.point.x, point.y - c.point.y) > .06) return undefined
    return { ...c, point: { ...c.point }, bbox: { ...c.bbox } }
  }
  reset(): void { this.epoch++; this.point = undefined; this.candidate = undefined; this.stableSince = 0 }
}
