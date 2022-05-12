import PrerenderSPAPlugin from 'prerender-spa-plugin-next';
import { ReactAppPrerenderOptions } from '../react-app-options';

export const prerenderPlugin = (options: ReactAppPrerenderOptions) => {
  return new PrerenderSPAPlugin(options);
};
