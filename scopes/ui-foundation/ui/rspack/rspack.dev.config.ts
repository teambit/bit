import { rspack, type Configuration } from '@rspack/core';
import type { Configuration as DevServerConfig } from '@rspack/dev-server';
import RefreshPlugin from '@rspack/plugin-react-refresh';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import noopServiceWorkerMiddleware from 'react-dev-utils/noopServiceWorkerMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import path, { sep } from 'path';
import { html } from './html';
import {
  moduleFileExtensions,
  resolveAlias,
  resolveFallbackDev,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack.common';

const clientHost = process.env.WDS_SOCKET_HOST;
const clientPath = process.env.WDS_SOCKET_PATH;
const port = process.env.WDS_SOCKET_PORT;

const publicUrlOrPath = getPublicUrlOrPath(true, sep, `${sep}public`);

export interface RspackConfigWithDevServer extends Configuration {
  devServer: DevServerConfig;
}

export function devConfig(workspaceDir, entryFiles, title): RspackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  const host = process.env.HOST || 'localhost';

  return {
    mode: 'development',

    devtool: 'eval-cheap-module-source-map',

    experiments: {
      css: true,
    },

    // enable persistent cache
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
    },

    optimization: {
      splitChunks: {
        chunks: 'all',
        maxSize: 2000000, // 2MB max — smaller chunks for parallel download + caching
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
        },
      },
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

        // cache JS/CSS assets in the browser so subsequent page loads are instant
        middlewares.unshift((req: any, res: any, next: any) => {
          if (/\.(js|css)(\?.*)?$/.test(req.url || '')) {
            res.setHeader('Cache-Control', 'public, max-age=120');
          }
          next();
        });

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
      alias: resolveAlias(),
      fallback: resolveFallbackDev,
    },

    watchOptions: {
      ignored: ['**/.bit/**', '**/.git/**', '**/node_modules/.cache/**'],
      poll: false, // native FS watching for the UI server
    },

    module: {
      parser: cssParser,
      rules: [
        mjsRule(),
        swcRule({ dev: true, refresh: true }),
        sourceMapRule(),
        ...styleRules({ sourceMap: true }),
        fontRule(),
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
