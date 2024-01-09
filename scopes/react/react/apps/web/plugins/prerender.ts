// we need to disable this eslint rule because the packages from "@prerenderer" doesn't have the "main" field in their package.json (https://github.com/import-js/eslint-plugin-import/issues/2132)
// eslint-disable-next-line import/no-unresolved
import type { RenderedRoute, PrerendererOptions } from '@prerenderer/prerenderer';
// eslint-disable-next-line import/no-unresolved
import PrerendererWebpackPlugin from '@prerenderer/webpack-plugin';
// eslint-disable-next-line import/no-unresolved
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
