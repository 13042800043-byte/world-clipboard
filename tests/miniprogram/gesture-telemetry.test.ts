import { describe, expect, it } from 'vitest';
import { GestureTelemetry } from '../../miniprogram/vision/gesture-telemetry';
import { VisionKitHandGestureAdapter } from '../../miniprogram/vision/visionkit-hand-tracker';

describe('bounded gesture diagnostics', () => {
  it('expires rows and measures only known clock segments, never fabricating camera inference latency', () => {
    const result = new VisionKitHandGestureAdapter().update(undefined, false, 0);
    const telemetry = new GestureTelemetry(true, 3, 100);
    for (const at of [0, 40, 80, 120]) {
      const row = telemetry.record({ ...result, accepted: true }, at, at + 2);
      telemetry.markUiComplete(row, at + 12);
      telemetry.recordCameraFrame(at);
    }
    const summary = telemetry.summary(120);
    expect(telemetry.snapshot(120).map(row => row.timestamp)).toEqual([40, 80, 120]);
    expect(summary.callbackToUiMs).toEqual({ count: 3, average: 12, p95: 12 });
    expect(summary.processingMs.average).toBe(2);
    expect(summary.handFps).toBe(25);
    expect(summary.cameraToUiMs).toBeNull();
    expect(telemetry.snapshot(300)).toEqual([]);
  });
  it('does not record data when debug is disabled', () => {
    const telemetry = new GestureTelemetry(false);
    expect(telemetry.record(new VisionKitHandGestureAdapter().update(), 0, 1)).toBeUndefined();
    expect(telemetry.summary(10).samples).toBe(0);
  });
});
