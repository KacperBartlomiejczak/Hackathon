import { facebookAdapter } from './facebook.js';
import { sampleAdapter } from './sample.js';
import { tiktokAdapter } from './tiktok.js';
import type { SourceAdapter, SourceKind } from './types.js';
import { webAdapter } from './web.js';
import { youtubeAdapter } from './youtube.js';

export { closeBrowser } from './web.js';

export const adapters: Partial<Record<SourceKind, SourceAdapter>> = {
  sample: sampleAdapter,
  web: webAdapter,
  tiktok: tiktokAdapter,
  facebook: facebookAdapter,
  youtube: youtubeAdapter,
};
