import type { RenderedRoute, PrerendererOptions } from '@prerenderer/prerenderer';
import PrerendererWebpackPlugin from '@prerenderer/webpack-plugin';
import JSdomPrerenderer, { JSDOMRendererOptions } from '@prerenderer/renderer-jsdom';

export interface WebpackPrerenderSPAOptions extends Omit<PrerendererOptions, 'staticDir'> {
  entryPath?: string;
  routes?: Array<string>;
  postProcess?: (renderedRoutes: RenderedRoute) => Promise<void> | void;
  urlModifier?(url: string): string;
  prerenderOptions?: JSDOMRendererOptions;
}

export const prerenderPlugin = (options: WebpackPrerenderSPAOptions) => {
  const { prerenderOptions, ...rest } = options;
  return new PrerendererWebpackPlugin({
    renderer: new JSdomPrerenderer({
      ...prerenderOptions,
    }),
    ...rest,
  });
};
