import path from 'path';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import { PubsubMain } from '@teambit/pubsub';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import { WebpackConfigWithDevServer } from '../webpack.dev-server';
import { fallbacks } from './webpack-fallbacks';

import { html } from './html';

import { WebpackBitReporterPlugin } from '../plugins/webpack-bit-reporter-plugin';
import { fallbacksProvidePluginConfig } from './webpack-fallbacks-provide-plugin-config';
import { fallbacksAliases } from './webpack-fallbacks-aliases';

const publicUrlOrPath = getPublicUrlOrPath(process.env.NODE_ENV === 'development', '/', '/public');

export function configFactory(
  devServerID: string,
  workspaceDir: string,
  entryFiles: string[],
  publicRoot: string,
  publicPath: string,
  pubsub: PubsubMain,
  title?: string,
  favicon?: string
): WebpackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  const publicDirectory = `${publicRoot}/${publicPath}`;

  return {
    // Environment mode
    mode: 'development',

    devtool: 'inline-source-map',

    // Entry point of app
    entry: entryFiles.map((filePath) => resolveWorkspacePath(filePath)),

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      path: resolveWorkspacePath(publicDirectory),

      // publicPath: resolveWorkspacePath(publicDirectory),

      chunkFilename: 'static/js/[name].chunk.js',

      // point sourcemap entries to original disk locations (format as URL on windows)
      devtoolModuleFilenameTemplate: (info) => pathNormalizeToLinux(path.resolve(info.absoluteResourcePath)),

      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      // Commented out to use the default (self) as according to tobias with webpack5 self is working with workers as well
      // globalObject: 'this',
    },

    infrastructureLogging: {
      level: 'error',
    },

    stats: {
      errorDetails: true,
    },

    devServer: {
      allowedHosts: 'all',

      static: [
        {
          directory: resolveWorkspacePath(publicDirectory),
          staticOptions: {},
          // Don't be confused with `dev.publicPath`, it is `publicPath` for static directory
          // Can be:
          // publicPath: ['/static-public-path-one/', '/static-public-path-two/'],
          publicPath: publicDirectory,
          // Can be:
          // serveIndex: {} (options for the `serveIndex` option you can find https://github.com/expressjs/serve-index)
          serveIndex: true,
          // Can be:
          // watch: {} (options for the `watch` option you can find https://github.com/paulmillr/chokidar)
          watch: true,
        },
      ],

      // Enable compression
      compress: true,

      // Enable hot reloading
      hot: true,

      historyApiFallback: {
        disableDotRule: true,
        index: resolveWorkspacePath(publicDirectory),
      },

      client: {
        overlay: false,
      },

      onBeforeSetupMiddleware(wds) {
        const { app } = wds;
        // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
        // middlewares before `redirectServedPath` otherwise will not have any effect
        // This lets us fetch source contents from webpack for the error overlay
        // @ts-ignore - @types/WDS mismatch - 3.11.6 vs 4.0.3
        app.use(evalSourceMapMiddleware(wds));
        // This lets us open files from the runtime error overlay.
        app.use(errorOverlayMiddleware());
      },

      onAfterSetupMiddleware({ app }) {
        // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
        app.use(redirectServedPath(publicUrlOrPath));

        // This service worker file is effectively a 'no-op' that will reset any
        // previous service worker registered for the same host:port combination.
        // We do this in development to avoid hitting the production cache if
        // it used the same host and port.
        // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
        app.use(noopServiceWorkerMiddleware(publicUrlOrPath));
      },

      devMiddleware: {
        // forward static files
        publicPath: path.join('/', publicRoot),
      },
    },

    resolve: {
      // TODO - check - we shoult not need both fallbacks and alias and provider plugin
      alias: fallbacksAliases,

      fallback: fallbacks as any,
    },

    plugins: [
      new HtmlWebpackPlugin({
        templateContent: html(title || 'Component preview'),
        filename: 'index.html',
        favicon,
      }),
      new webpack.ProvidePlugin(fallbacksProvidePluginConfig),

      new WebpackBitReporterPlugin({
        options: { pubsub, devServerID },
      }),
    ],
  };
}
