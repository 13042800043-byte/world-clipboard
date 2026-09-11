import type { ClipboardItem } from './clipboard-types';

let currentItem: ClipboardItem | undefined;

export const clipboardStore = {
  set(item: ClipboardItem): void {
    currentItem = item;
  },
  get(): ClipboardItem | undefined {
    return currentItem;
  },
  clear(): void {
    currentItem = undefined;
  },
};
