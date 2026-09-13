export function shouldRenderSpatialFrame(
  lastRenderedAt: number,
  now: number,
  intervalMs: number,
  force: boolean,
): boolean {
  return force || now - lastRenderedAt >= intervalMs;
}

/** Preserve fractional cadence, without queuing or replaying old observations. */
export function advanceSpatialRenderClock(lastRenderedAt: number, now: number, intervalMs: number, force: boolean): number {
  return force ? now : now - (now - lastRenderedAt) % intervalMs;
}
