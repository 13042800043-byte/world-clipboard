import { createTemplatePlugin } from '../template-plugin'
export const PIXEL_ART_PLUGIN_AVAILABLE = true
export const pixelArtPlugin = createTemplatePlugin('pixel', '像素画', { size: 32, maxColors: 16, border: 8 })
