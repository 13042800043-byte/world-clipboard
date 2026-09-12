import type { ClipboardItem, CaptureMode } from '../clipboard/clipboard-types'
import type { FinalPhoto } from './final-capture-controller'
import { delay } from './final-capture-controller'
import { CUTOUT_CONFIG } from './cutout-config'
import type { Segmenter } from './segmentation-adapter'

export class FinalSegmentationController {
  constructor(private readonly segmenter: Segmenter, private readonly sleep = delay) {}
  async segment(photo: FinalPhoto, mode: CaptureMode, recapture: () => Promise<FinalPhoto>, debug = false,
    isActive: () => boolean = () => true): Promise<ClipboardItem> {
    let current = photo
    for (let attempt = 0; ; attempt++) {
      if (!isActive()) throw new Error('抓取已取消')
      try {
        return await this.segmenter.segment({ image: current.image, point: current.point, mode, debug,
          prompt: { positivePoints: [current.point], negativePoints: current.negativePoints,
            box: CUTOUT_CONFIG.USE_POINT_BOX_FINAL_SEGMENTATION ? current.box : undefined } })
      } catch (error) {
        const blurry = error && typeof error === 'object' && 'code' in error && error.code === 'BLURRY_CAPTURE'
        if (!blurry || !CUTOUT_CONFIG.USE_SHARPNESS_GATE || attempt >= CUTOUT_CONFIG.MAX_RECAPTURE_COUNT || !isActive()) throw error
        await this.sleep(CUTOUT_CONFIG.RECAPTURE_DELAY_MS)
        if (!isActive()) throw new Error('抓取已取消')
        current = await recapture()
      }
    }
  }
}
