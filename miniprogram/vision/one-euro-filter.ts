export interface OneEuroOptions {
  minCutoff: number
  beta: number
  derivativeCutoff: number
}

// Speed-adaptive low pass; algorithm: https://gery.casiez.net/1euro/
export class OneEuroFilter {
  private previousRaw?: number
  private previousFiltered?: number
  private derivative = 0
  private timestamp?: number

  constructor(private readonly options: OneEuroOptions = { minCutoff: 1.5, beta: 8, derivativeCutoff: 1 }) {}

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) return this.previousFiltered ?? 0
    if (this.timestamp === undefined || this.previousRaw === undefined || this.previousFiltered === undefined) {
      this.timestamp = timestampMs
      this.previousRaw = this.previousFiltered = value
      return value
    }
    if (timestampMs <= this.timestamp) return this.previousFiltered
    const dt = (timestampMs - this.timestamp) / 1000
    const rawDerivative = (value - this.previousRaw) / dt
    this.derivative += alpha(this.options.derivativeCutoff, dt) * (rawDerivative - this.derivative)
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.derivative)
    this.previousFiltered += alpha(cutoff, dt) * (value - this.previousFiltered)
    this.timestamp = timestampMs
    this.previousRaw = value
    return this.previousFiltered
  }

  reset(): void {
    this.previousRaw = this.previousFiltered = this.timestamp = undefined
    this.derivative = 0
  }
}

function alpha(cutoff: number, dt: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * Math.max(cutoff, 0.001) * dt))
}
