import { join } from 'path';
import PrerenderSPAPlugin from '@dreysolano/prerender-spa-plugin';
import { ReactAppOptions } from '../react-app-options';

export const prerenderSPAPlugin = (prerender: ReactAppOptions['prerender'], staticDir: string) => {
  return new PrerenderSPAPlugin({
    staticDir,
    routes: prerender?.routes,
    postProcess(renderedRoute: any) {
      renderedRoute.outputPath = join(staticDir, `${renderedRoute.originalRoute}.html`);
      return renderedRoute;
    },
    server: {
      ...prerender?.server,
    },
  });
};
