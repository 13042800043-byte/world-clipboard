import { APP_CONFIG } from '../config'
import { RemoteTemplateGenerator } from './template-generator'
import type { TemplateKind, TemplateOptions, TemplatePlugin } from './template-types'

const remote = new RemoteTemplateGenerator(APP_CONFIG.VISION_API_BASE_URL)
export function createTemplatePlugin(kind: TemplateKind, title: string, defaults: TemplateOptions): TemplatePlugin {
  return { kind, title, defaults, generate: (item, options) => remote.generate(kind, item, options) }
}
