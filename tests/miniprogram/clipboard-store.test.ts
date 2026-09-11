import { afterEach, describe, expect, it } from 'vitest';
import { clipboardStore } from '../../miniprogram/clipboard/clipboard-store';

describe('clipboardStore', () => {
  afterEach(() => clipboardStore.clear());

  it('stores the latest captured item independently from paste plugins', () => {
    clipboardStore.set({
      id: 'cat-1',
      type: 'object',
      createdAt: 1,
      previewImage: 'mock://cat',
      spatial: { x: 0.5, y: 0.6, scale: 1, rotation: 0 },
    });

    expect(clipboardStore.get()?.id).toBe('cat-1');
  });
});
