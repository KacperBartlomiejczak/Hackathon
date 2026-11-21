import { sampleAdapter } from './sample.js';
import type { SourceAdapter, SourceKind } from './types.js';
import { webAdapter } from './web.js';

export { closeBrowser } from './web.js';

export const adapters: Partial<Record<SourceKind, SourceAdapter>> = {
  sample: sampleAdapter,
  web: webAdapter,
};
