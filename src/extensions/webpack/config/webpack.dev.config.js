const HtmlWebpackPlugin = require('html-webpack-plugin');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');
const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');
const redirectServedPath = require('react-dev-utils/redirectServedPathMiddleware');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const path = require('path');
const html = require('./html');

const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH; // default: '/sockjs-node'
const sockPort = process.env.WDS_SOCKET_PORT;

const publicUrlOrPath = getPublicUrlOrPath(process.env.NODE_ENV === 'development', '/', '/public');

module.exports = function (workspaceDir, entryFiles) {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  return {
    // Environment mode
    mode: 'development',

    devtool: 'inline-source-map',

    // Entry point of app
    entry: {
      entry: entryFiles.map((filePath) => resolveWorkspacePath(filePath)),
    },

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      path: resolveWorkspacePath('/'),

      publicPath: publicUrlOrPath,

      futureEmitAssets: true,

      chunkFilename: 'static/js/[name].chunk.js',

      // point sourcemap entries to original disk locations (format as URL on windows)
      devtoolModuleFilenameTemplate: (info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),

      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      globalObject: 'this',
    },

    devServer: {
      // Serve index.html as the base
      contentBase: resolveWorkspacePath(publicUrlOrPath),

      // By default files from `contentBase` will not trigger a page reload.
      watchContentBase: true,

      contentBasePublicPath: publicUrlOrPath,

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
        index: publicUrlOrPath,
      },

      sockHost,
      sockPath,
      sockPort,

      before(app, server) {
        // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
        // middlewares before `redirectServedPath` otherwise will not have any effect
        // This lets us fetch source contents from webpack for the error overlay
        app.use(evalSourceMapMiddleware(server));
        // This lets us open files from the runtime error overlay.
        app.use(errorOverlayMiddleware());
      },

      after(app) {
        // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
        app.use(redirectServedPath(publicUrlOrPath));

        // This service worker file is effectively a 'no-op' that will reset any
        // previous service worker registered for the same host:port combination.
        // We do this in development to avoid hitting the production cache if
        // it used the same host and port.
        // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
        app.use(noopServiceWorkerMiddleware(publicUrlOrPath));
      },

      // Public path is root of content base
      publicPath: publicUrlOrPath.slice(0, -1),
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },

    plugins: [
      new HtmlWebpackPlugin({
        templateContent: html('Component preview'),
        filename: 'index.html',
      }),
    ],
  };
};
