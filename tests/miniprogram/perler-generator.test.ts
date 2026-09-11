import { describe, expect, it } from 'vitest';
import { generateMockPerler } from '../../miniprogram/plugins/perler/perler-generator';

describe('generateMockPerler', () => {
  it('creates a complete 32 by 32 grid and color counts', () => {
    const result = generateMockPerler('object');
    expect(result.size).toBe(32);
    expect(result.cells).toHaveLength(1024);
    expect(result.totalBeads).toBeGreaterThan(0);
    expect(result.colors.reduce((total, color) => total + color.count, 0)).toBe(result.totalBeads);
  });
});
