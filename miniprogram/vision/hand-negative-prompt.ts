import type { NormalizedPoint } from './hand-tracker'
import type { PromptBox } from './final-capture-controller'

// Palm/wrist samples, not fingertips touching the object. Conservative prompts
// are not a hand segmentation model: protect the target box and its seed.
export function buildHandNegativePrompt(landmarks: NormalizedPoint[], positive: NormalizedPoint, box?: PromptBox): NormalizedPoint[] {
  const samples: NormalizedPoint[] = []
  for (const index of [0, 1, 2, 5, 9, 13, 17]) {
    const p = landmarks[index]
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue
    if (Math.hypot(p.x - positive.x, p.y - positive.y) < .08) continue
    if (box && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height) continue
    if (samples.some(other => Math.hypot(other.x - p.x, other.y - p.y) < .02)) continue
    samples.push({ ...p })
  }
  return samples
}
