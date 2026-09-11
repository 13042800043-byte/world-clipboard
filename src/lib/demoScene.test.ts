import { describe, expect, it } from 'vitest';
import { findDemoObjectAt } from './demoScene';

describe('findDemoObjectAt', () => {
  it('selects the mug from its body and handle', () => {
    expect(findDemoObjectAt({ x: 0.28, y: 0.64 })?.id).toBe('mug');
    expect(findDemoObjectAt({ x: 0.41, y: 0.58 })?.id).toBe('mug');
  });

  it('selects the plant without confusing it with the table', () => {
    expect(findDemoObjectAt({ x: 0.69, y: 0.38 })?.id).toBe('plant');
  });

  it('returns no object for empty space', () => {
    expect(findDemoObjectAt({ x: 0.08, y: 0.15 })).toBeUndefined();
  });
});

