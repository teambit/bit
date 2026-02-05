import rspack, { type Configuration } from '@rspack/core';
import type { Configuration as DevServerConfig } from '@rspack/dev-server';
import RefreshPlugin from '@rspack/plugin-react-refresh';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import path, { sep } from 'path';
import { html } from './html';

/*
 * Rspack config for the bit ui (replaces webpack.dev.config.ts)
 * i.e. `bit start --dev`,
 */

const clientHost = process.env.WDS_SOCKET_HOST;
const clientPath = process.env.WDS_SOCKET_PATH;
const port = process.env.WDS_SOCKET_PORT;

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

export interface RspackConfigWithDevServer extends Configuration {
  devServer: DevServerConfig;
}

export function devConfig(workspaceDir, entryFiles, title): RspackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  const host = process.env.HOST || 'localhost';

  return {
    mode: 'development',

    devtool: 'eval-cheap-module-source-map',

    // Enable persistent cache
    cache: true,

    entry: {
      main: entryFiles,
    },

    output: {
      filename: 'static/js/[name].bundle.js',
      path: resolveWorkspacePath('/'),
      publicPath: publicUrlOrPath,
      pathinfo: false, // faster compilation
      chunkFilename: 'static/js/[name].chunk.js',
      cssFilename: 'static/css/[name].bundle.css',
      cssChunkFilename: 'static/css/[name].chunk.css',
    },

    experiments: {
      css: true,
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
          publicPath: publicUrlOrPath,
          serveIndex: true,
          watch: false,
        },
      ],

      compress: true,
      hot: true,
      liveReload: false, // HMR only — liveReload causes full page reloads on HMR failure
      host,

      historyApiFallback: {
        disableDotRule: true,
        index: publicUrlOrPath,
      },

      client: {
        overlay: { errors: true, warnings: false },
        reconnect: 5,
        ...(clientHost || clientPath || port
          ? {
              webSocketURL: {
                hostname: clientHost,
                pathname: clientPath,
                port,
              },
            }
          : {}),
      },

      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('rspack-dev-server is not defined');
        }

        middlewares.push(
          // @ts-ignore @types/wds mismatch
          evalSourceMapMiddleware(devServer),
          errorOverlayMiddleware(),
          redirectServedPath(publicUrlOrPath),
          noopServiceWorkerMiddleware(publicUrlOrPath)
        );
        return middlewares;
      },

      devMiddleware: {
        publicPath: publicUrlOrPath.slice(0, -1),
      },
    },

    resolve: {
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
        '@teambit/semantics.entities.semantic-schema': require.resolve('@teambit/semantics.entities.semantic-schema'),
        '@teambit/code.ui.code-editor': require.resolve('@teambit/code.ui.code-editor'),
        '@teambit/api-reference.hooks.use-api': require.resolve('@teambit/api-reference.hooks.use-api'),
        '@teambit/api-reference.hooks.use-api-renderers': require.resolve(
          '@teambit/api-reference.hooks.use-api-renderers'
        ),
      },
      fallback: {
        fs: false,
        path: fallbacks.path,
        stream: false,
        process: fallbacks.process,
      },
    },

    watchOptions: {
      ignored: ['**/.bit/**', '**/.git/**', '**/node_modules/.cache/**'],
      poll: false, // native FS watching for the UI server
    },

    module: {
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        // TypeScript and JSX files - use rspack's builtin SWC loader (much faster than babel)
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: true,
                    refresh: true,
                  },
                },
                target: 'es2015',
              },
            },
          },
          type: 'javascript/auto',
        },
        // Bit component JS files in node_modules - need source maps + react refresh
        {
          test: /\.js$/,
          enforce: 'pre' as const,
          include: /node_modules/,
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: (value) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        // SASS/SCSS support via rspack native CSS
        {
          test: /\.(sass|scss)$/,
          use: [
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
          type: 'css/auto',
        },
        // LESS support via rspack native CSS
        {
          test: /\.less$/,
          use: [
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
          type: 'css/auto',
        },
        // Font files
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
      new RefreshPlugin(),
      new rspack.HtmlRspackPlugin({
        inject: true,
        templateContent: html(title || 'My component workspace')(),
        chunks: ['main'],
        filename: 'index.html',
      }),
      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };
}
