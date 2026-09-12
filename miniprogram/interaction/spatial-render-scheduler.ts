export function shouldRenderSpatialFrame(
  lastRenderedAt: number,
  now: number,
  intervalMs: number,
  force: boolean,
): boolean {
  return force || now - lastRenderedAt >= intervalMs;
}
