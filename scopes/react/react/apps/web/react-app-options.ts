import { Bundler, DevServer } from '@teambit/bundler';
import { WebpackConfigTransformer } from '@teambit/webpack';

import { ReactDeployContext } from './deploy-context';

export type ReactAppPrerenderOptions = {
  /**
   * routes to prerender
   */
  routes: string[];
  /**
   * the proxy server you want the prerender headless browser to run on
   */

  server?: { proxy: { [key: string]: { target: 'http://localhost:8000/'; pathRewrite: { [key: string]: string } } } };

  /**
   * Post processing of the prerendered html. This is useful for adding meta tags to the html or changing the file name.
   */
  postProcess?: (prerenderRoute: string, staticDir: string) => string;
};

export type ReactAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry files of the application.
   */
  entry: string[];

  /**
   * use server-side rendering for the app.
   */
  ssr?: boolean;

  /**
   * instance of bundler to use. default is Webpack.
   */
  bundler?: Bundler;

  /**
   * instance of dev server to use. default is Webpack.
   */
  devServer?: DevServer;

  /**
   * set webpack transformers
   */
  webpackTransformers?: WebpackConfigTransformer[];

  /**
   * decide whether to prerender your app. accepts an array of routes. if none, prerender would not apply.
   *  e.g ['/plugins', '/learn', '/docs/quick-start]
   * You can also pass a configuration for the proxy, please refer here: https://github.com/webpack/docs/wiki/webpack-dev-server#proxy
   *
   */
  prerender?: ReactAppPrerenderOptions;

  /**
   * deploy function.
   */
  deploy?: (context: ReactDeployContext) => Promise<void>;

  /**
   * ranges of ports to use to run the app server.
   */
  portRange?: number[];

  /**
   * favicon for the app. You can pass an abs path (using require.resolve()) or a url.
   */
  favicon?: string;
};
