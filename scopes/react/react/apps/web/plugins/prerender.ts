import PrerenderSPAPlugin from 'prerender-spa-plugin-next';
import { PuppeteerRenderer } from '@teambit/react.modules.prerenderer-puppeteer';
import { ReactAppPrerenderOptions } from '../react-app-options';

export const prerenderPlugin = (options: ReactAppPrerenderOptions) => {
  return new PrerenderSPAPlugin({
    renderer: PuppeteerRenderer,
    ...options,
  });
};
