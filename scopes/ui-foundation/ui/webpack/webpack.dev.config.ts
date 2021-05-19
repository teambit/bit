import { Configuration } from 'webpack';
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';

const HtmlWebpackPlugin = require('html-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');
const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');
const redirectServedPath = require('react-dev-utils/redirectServedPathMiddleware');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const path = require('path');
const { default: html } = require('./html');

/*
 * Webpack config for the bit ui
 * i.e. `bit start --dev`,
 */

const clientHost = process.env.WDS_SOCKET_HOST;
const clientPath = process.env.WDS_SOCKET_PATH; // default is '/sockjs-node';
const port = process.env.WDS_SOCKET_PORT;

// const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
// const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
//   '@pmmmwh/react-refresh-webpack-plugin/lib/runtime/RefreshUtils'
// );

const publicUrlOrPath = getPublicUrlOrPath(process.env.NODE_ENV === 'development', '/', '/public');

const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
];

module.exports = {
  createWebpackConfig,
  devConfig: createWebpackConfig,
};

function createWebpackConfig(workspaceDir, entryFiles, title, aspectPaths): Configuration {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  return {
    // Environment mode
    mode: 'development',
    // improves HMR
    snapshot: { managedPaths: [] },

    devtool: 'inline-source-map',

    // Entry point of app
    entry: {
      main: entryFiles,
      // preview: entryFiles.map(filePath => resolveWorkspacePath(filePath))
    },

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      path: resolveWorkspacePath('/'),

      publicPath: publicUrlOrPath,

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

    // @ts-ignore - remove this once there is types package for webpack-dev-server v4
    devServer: {
      static: [
        {
          directory: resolveWorkspacePath(publicUrlOrPath),
          staticOptions: {},
          // Don't be confused with `dev.publicPath`, it is `publicPath` for static directory
          // Can be:
          // publicPath: ['/static-public-path-one/', '/static-public-path-two/'],
          publicPath: publicUrlOrPath,
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
        index: publicUrlOrPath,
      },

      client: {
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
        publicPath: publicUrlOrPath.slice(0, -1),
      },
    },

    resolve: {
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: {
        react: require.resolve('react'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        // 'react-refresh/runtime': require.resolve('react-refresh/runtime'),
      },
      fallback: {
        fs: false,
        path: require.resolve('path-browserify'),
        stream: false,
        process: false,
      },
    },

    module: {
      // Webpack by default includes node_modules under its managed paths which cause the whole directory to be cached
      // Watch mode requires us to turn off unsafeCache as well
      // this de-optimizes the dev build but ensures hmr works when writing/linking into node modules.
      // However we do not lose the caching entirely like cache: false
      unsafeCache: false,
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        {
          test: /\.js$/,
          enforce: 'pre',
          include: /node_modules/,
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: (value) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          include: workspaceDir,
          loader: require.resolve('babel-loader'),
          options: {
            configFile: false,
            babelrc: false,
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app'),
            ],
            plugins: [require.resolve('react-refresh/babel')],
          },
        },
        {
          test: stylesRegexps.sassModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.sassNoModuleRegex,
          use: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.lessModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.lessNoModuleRegex,
          use: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.cssModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.cssNoModulesRegex,
          use: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },

    plugins: [
      new ReactRefreshWebpackPlugin({
        // exclude: /@pmmmwh/, // replaces the default value of `/node_modules/`
        include: aspectPaths,
      }),
      // Re-generate index.html with injected script tag.
      // The injected script tag contains a src value of the
      // filename output defined above.
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: html(title || 'My component workspace'),
        chunks: ['main'],
        filename: 'index.html',
      }),
      // new HtmlWebpackPlugin({
      //   templateContent: html('Component preview'),
      //   chunks: ['preview'],
      //   filename: 'preview.html'
      // })
    ],
  };
}
