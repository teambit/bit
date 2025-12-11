import type { Bundler, DevServer } from '@teambit/bundler';
import type { WebpackConfigTransformer } from '@teambit/webpack';

import type { ReactDeployContext } from './deploy-context';

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

  /**
   * path to load the webpack instance from
   */
  webpackModulePath?: string;

  /**
   * path to load the webpack dev server instance from.
   */
  webpackDevServerModulePath?: string;
};
