import type { CaptureMode } from '../../clipboard/clipboard-types'

Component({
  properties: {
    active: {
      type: String,
      value: 'object',
    },
  },

  data: {
    modes: [
      { id: 'object' as CaptureMode, icon: '◇', label: '物体' },
      { id: 'color' as CaptureMode, icon: '◉', label: '颜色' },
      { id: 'contour' as CaptureMode, icon: '▱', label: '轮廓' },
    ],
  },

  methods: {
    onModeTap(event: MiniProgramTouchEvent) {
      const mode = event.currentTarget.dataset.mode as CaptureMode
      this.triggerEvent('change', { mode })
    },
  },
})
