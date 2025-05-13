import { ProvidePlugin } from 'webpack';
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { fallbacksProvidePluginConfig, WebpackConfigWithDevServer, fallbacks } from '@teambit/webpack';

import HtmlWebpackPlugin from 'html-webpack-plugin';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import path, { sep } from 'path';
import { html } from './html';

/*
 * Webpack config for the bit ui
 * i.e. `bit start --dev`,
 */

const matchNothingRegex = 'a^';
const clientHost = process.env.WDS_SOCKET_HOST;
const clientPath = process.env.WDS_SOCKET_PATH; // default is '/sockjs-node';
const port = process.env.WDS_SOCKET_PORT;

// const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
// const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
//   '@pmmmwh/react-refresh-webpack-plugin/lib/runtime/RefreshUtils'
// );

const publicUrlOrPath = getPublicUrlOrPath(true, sep, `${sep}public`);

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

export function devConfig(workspaceDir, entryFiles, title): WebpackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  return {
    // Environment mode
    mode: 'development',
    // improves HMR - assume node_modules might change
    snapshot: { managedPaths: [] },

    devtool: 'eval-cheap-module-source-map',

    // Entry point of app
    entry: {
      main: entryFiles,
    },

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      path: resolveWorkspacePath('/'),

      publicPath: publicUrlOrPath,

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

      // Enable hot reloading
      hot: true,

      host,

      historyApiFallback: {
        disableDotRule: true,
        index: publicUrlOrPath,
      },

      client: {
        webSocketURL: {
          hostname: clientHost,
          pathname: clientPath,
          port,
        },
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
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        '@teambit/component.ui.component-compare.context': require.resolve(
          '@teambit/component.ui.component-compare.context'
        ),
        '@teambit/base-react.navigation.link': require.resolve('@teambit/base-react.navigation.link'),
        '@teambit/base-ui.graph.tree.recursive-tree': require.resolve('@teambit/base-ui.graph.tree.recursive-tree'),
        // 'react-refresh/runtime': require.resolve('react-refresh/runtime'),
      },
      fallback: {
        fs: false,
        path: fallbacks.path,
        stream: false,
        process: fallbacks.process,
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
          use: [require.resolve('@pmmmwh/react-refresh-webpack-plugin/loader'), require.resolve('source-map-loader')],
        },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          include: workspaceDir,
          use: [
            require.resolve('@pmmmwh/react-refresh-webpack-plugin/loader'),
            {
              loader: require.resolve('babel-loader'),
              options: {
                configFile: false,
                babelrc: false,
                sourceType: 'unambiguous',
                presets: [
                  [
                    require.resolve('@babel/preset-env'),
                    {
                      // Exclude transforms that make all code slower
                      exclude: ['transform-typeof-symbol'],
                    },
                  ],
                  [
                    require.resolve('@babel/preset-react'),
                    {
                      development: true,
                      // Will use the native built-in instead of trying to polyfill
                      // behavior for any plugins that require one. This option will be removed in Babel 8.
                      useBuiltIns: true,
                    },
                  ],
                ],
                plugins: [require.resolve('react-refresh/babel')],
              },
            },
          ],
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
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          type: 'asset',
          generator: {
            filename: 'static/fonts/[hash][ext][query]',
          },
        },
      ],
    },

    plugins: [
      new ReactRefreshWebpackPlugin({
        // we use '@pmmmwh/react-refresh-webpack-plugin/loader' directly where relevant.
        // FYI, original defaults of the plugin are:
        // include: /\.([cm]js|[jt]sx?|flow)$/i, exclude: /node_modules/,
        include: matchNothingRegex,
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
      new ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };
}
