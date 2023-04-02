import { Bundler, DevServer } from '@teambit/bundler';
import { WebpackConfigTransformer } from '@teambit/webpack';

import { ReactDeployContext } from './deploy-context';
import { WebpackPrerenderSPAOptions } from './plugins/prerender';

/** https://github.com/Tofandel/prerenderer */
export type ReactAppPrerenderOptions = WebpackPrerenderSPAOptions;

export type ReactAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry files of the application.
   */
  entry: string[] | ((path?: string) => Promise<string[]>);

  /**
   * path to server-rendered entrypoint of the app
   */
  ssr?: string | (() => Promise<string>);

  /**
   * instance of bundler to use. default is Webpack.
   */
  bundler?: Bundler;

  /**
   * instance of serverside bundler to use. default is Webpack.
   */
  ssrBundler?: Bundler;

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
  portRange?: [start: number, end: number];

  /**
   * favicon for the app. You can pass an abs path (using require.resolve()) or a url.
   */
  favicon?: string;
};
