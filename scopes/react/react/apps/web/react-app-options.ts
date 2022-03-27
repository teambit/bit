import { Bundler, DevServer } from '@teambit/bundler';
import { WebpackConfigTransformer } from '@teambit/webpack';

import { ReactDeployContext } from './deploy-context';

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
   * e.g ['/plugins', '/learn', '/docs/quick-start]
   */
  prerender?: {
    routes?: string[];
  };

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
