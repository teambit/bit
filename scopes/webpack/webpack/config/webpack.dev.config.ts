import path from 'path';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import type { PubsubMain } from '@teambit/pubsub';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import type { WebpackConfigWithDevServer } from '../webpack.dev-server';
import { fallbacks } from './webpack-fallbacks';

import { html } from './html';

import { WebpackBitReporterPlugin } from '../plugins/webpack-bit-reporter-plugin';
import { fallbacksProvidePluginConfig } from './webpack-fallbacks-provide-plugin-config';
import { fallbacksAliases } from './webpack-fallbacks-aliases';

const publicUrlOrPath = getPublicUrlOrPath(true, '/', '/public');

export function configFactory(
  devServerID: string,
  workspaceDir: string,
  entryFiles: string[],
  publicRoot: string,
  publicPath: string,
  componentPathsRegExps: RegExp[],
  pubsub: PubsubMain,
  title?: string,
  favicon?: string
): WebpackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  const publicDirectory = `${publicRoot}/${publicPath}`;

  return {
    // Environment mode
    mode: 'development',

    devtool: 'eval-cheap-module-source-map',

    // Entry point of app
    entry: entryFiles.map((filePath) => resolveWorkspacePath(filePath)),

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

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
      logging: 'error',
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
          // Disabled: The static public directory typically doesn't exist, and when Chokidar
          // watches a non-existent path, it recursively watches parent directories until it
          // finds one that exists - potentially watching the entire workspace root.
          // This causes unnecessary file system events and wastes FSEvents streams on macOS.
          watch: false,
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
        logging: 'error',
      },

      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }

        // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
        // middlewares before `redirectServedPath` otherwise will not have any effect
        // This lets us fetch source contents from webpack for the error overlay
        middlewares.push(
          // @ts-ignore @types/wds mismatch
          evalSourceMapMiddleware(devServer),
          // This lets us open files from the runtime error overlay.
          errorOverlayMiddleware(),
          // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
          redirectServedPath(publicUrlOrPath),
          // This service worker file is effectively a 'no-op' that will reset any
          // previous service worker registered for the same host:port combination.
          // We do this in development to avoid hitting the production cache if
          // it used the same host and port.
          // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
          noopServiceWorkerMiddleware(publicUrlOrPath)
        );
        return middlewares;
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

    snapshot: componentPathsRegExps && componentPathsRegExps.length > 0 ? { managedPaths: componentPathsRegExps } : {},

    watchOptions: {
      poll: true,
    },
  };
}
