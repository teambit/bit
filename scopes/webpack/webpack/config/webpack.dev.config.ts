import path from 'path';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import { fallbacks } from './webpack-fallbacks';

import html from './html';

import WebpackBitReporterPlugin from '../plugins/webpack-bit-reporter-plugin';

const clientHost = process.env.WDS_SOCKET_HOST;
const clientPath = process.env.WDS_SOCKET_PATH; // default is '/sockjs-node';
const port = process.env.WDS_SOCKET_PORT;

const publicUrlOrPath = getPublicUrlOrPath(process.env.NODE_ENV === 'development', '/', '/public');

export function configFactory(devServerID, workspaceDir, entryFiles, publicRoot, publicPath, pubsub, title?) {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

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
      devtoolModuleFilenameTemplate: (info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),

      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      // Commented out to use the default (self) as according to tobias with webpack5 self is working with workers as well
      // globalObject: 'this',
    },

    infrastructureLogging: {
      level: 'error',
    },

    stats: 'errors-only',

    devServer: {
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

      // Use 'ws' instead of 'sockjs-node' on server since we're using native
      // websockets in `webpackHotDevClient`.
      transportMode: 'ws',

      // Enable hot reloading
      hot: true,

      host,

      historyApiFallback: {
        disableDotRule: true,
        index: resolveWorkspacePath(publicDirectory),
      },

      client: {
        needClientEntry: false,
        overlay: false,
        host: clientHost,
        path: clientPath,
        port,
      },

      onBeforeSetupMiddleware(app, server) {
        // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
        // middlewares before `redirectServedPath` otherwise will not have any effect
        // This lets us fetch source contents from webpack for the error overlay
        app.use(evalSourceMapMiddleware(server));
        // This lets us open files from the runtime error overlay.
        app.use(errorOverlayMiddleware());
      },

      onAfterSetupMiddleware(app) {
        // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
        app.use(redirectServedPath(publicUrlOrPath));

        // This service worker file is effectively a 'no-op' that will reset any
        // previous service worker registered for the same host:port combination.
        // We do this in development to avoid hitting the production cache if
        // it used the same host and port.
        // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
        app.use(noopServiceWorkerMiddleware(publicUrlOrPath));
      },

      dev: {
        // Public path is root of content base
        publicPath: publicRoot,
      },
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.mdx', '.md'],
      alias: {
        process: require.resolve('process/browser'),
        buffer: require.resolve('buffer/'),
      },

      fallback: fallbacks,
    },

    plugins: [
      new HtmlWebpackPlugin({
        templateContent: html(title || 'Component preview'),
        filename: 'index.html',
      }),

      new webpack.ProvidePlugin({
        process: require.resolve('process/browser'),
        Buffer: [require.resolve('buffer/'), 'Buffer'],
      }),

      new WebpackBitReporterPlugin({
        options: { pubsub, devServerID },
      }),
    ],
  };
}
