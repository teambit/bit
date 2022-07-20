import { Asset } from '@teambit/bundler';
import type { SsrContent } from '@teambit/ui/react-ssr';

export function parseAssets(assets: Asset[]): SsrContent['assets'] {
  return {
    css: assets.map((x) => x.name).filter((name) => name?.endsWith('.css')),
    js: assets.map((x) => x.name).filter((name) => name?.endsWith('.js')),
  };
}
