import { join } from 'path';
import PrerenderSPAPlugin from '@dreysolano/prerender-spa-plugin';

export const prerenderSPAPlugin = (prerenderRoutes: string[], staticDir: string) => {
  return new PrerenderSPAPlugin({
    staticDir,
    routes: prerenderRoutes,
    postProcess(renderedRoute: any) {
      renderedRoute.outputPath = join(staticDir, `${renderedRoute.originalRoute}.html`);
      return renderedRoute;
    },
  });
};
