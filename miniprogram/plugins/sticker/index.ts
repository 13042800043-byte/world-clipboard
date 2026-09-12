import { createTemplatePlugin } from '../template-plugin'
export const STICKER_PLUGIN_AVAILABLE = true
export const stickerPlugin = createTemplatePlugin('sticker', '透明贴纸', { size: 32, maxColors: 16, border: 8 })
