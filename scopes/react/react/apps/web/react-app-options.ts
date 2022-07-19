import { Bundler, DevServer } from '@teambit/bundler';
import { WebpackConfigTransformer } from '@teambit/webpack';

import { ReactDeployContext } from './deploy-context';

type prerenderedRoute = {
  /** The prerendered route, after following redirects */
  route: string;
  /** The original route passed, before redirects */
  originalRoute: string;
  /** The resulting HTML for the route */
  html: string;
  /**
   * The path to write the rendered HTML to.
   * This is null (automatically calculated after postProcess)
   * unless explicitly set. */
  outputPath?: string | null;
};

/** https://github.com/Tofandel/prerender-spa-plugin-next */
export type ReactAppPrerenderOptions = {
  /**
   * sub folder to output the prerender, inside the webpack output folder
   * @default '/'
   */
  staticDir?: string;

  /** The index file to fall back on for SPAs. */
  indexPath?: string;

  /**
   * routes to prerender
   */
  routes: string[];

  /**
   * the proxy server you want the prerender headless browser to run on
   */
  server?: {
    proxy: {
      [key: string]: {
        /** required by HPM.
         * @default 'http://localhost:8000/' */
        target: string;
        pathRewrite: { [key: string]: string };
      };
    };
  };

  /**
   * Post processing of the prerendered html. This is useful for adding meta tags to the html or changing the file name.
   */
  postProcess?: (prerenderRoute: prerenderedRoute) => prerenderedRoute;

  /** The renderer you'd like to use to prerender the app.
   * @default new require("@prerenderer/renderer-puppeteer").
   */
  renderer?: any;

  /** options to pass to the renderer class's constructor */
  rendererOptions?: any;
};

export type ReactAppOptions = {
  /**
   * name of the application.
   */
  name: string;

  /**
   * path to entry files of the application.
   */
  entry: string[] | (() => Promise<string[]>);

  // TODO -
  /**
   * path to SSR entrypoint of the app
   */
  ssr?: string | (() => Promise<string>);

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
  portRange?: [number, number];

  /**
   * favicon for the app. You can pass an abs path (using require.resolve()) or a url.
   */
  favicon?: string;
};
