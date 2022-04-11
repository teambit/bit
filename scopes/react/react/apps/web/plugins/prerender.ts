import { join } from 'path';
import PrerenderSPAPlugin from '@dreysolano/prerender-spa-plugin';
import { ReactAppPrerenderOptions } from '../react-app-options';

export const prerenderSPAPlugin = (prerender: ReactAppPrerenderOptions, staticDir: string) => {
  return new PrerenderSPAPlugin({
    staticDir,
    routes: prerender?.routes,
    postProcess(renderedRoute: any) {
      if (prerender.postProcess) return prerender.postProcess(renderedRoute, staticDir);
      renderedRoute.outputPath = join(staticDir, `${renderedRoute.originalRoute}.html`);
      return renderedRoute;
    },
    server: {
      ...prerender?.server,
    },
  });
};
