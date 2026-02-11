import { rspack, type Configuration } from '@rspack/core';
import type { Configuration as DevServerConfig } from '@rspack/dev-server';
import RefreshPlugin from '@rspack/plugin-react-refresh';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import errorOverlayMiddleware from 'react-dev-utils/errorOverlayMiddleware';
import evalSourceMapMiddleware from 'react-dev-utils/evalSourceMapMiddleware';
import redirectServedPath from 'react-dev-utils/redirectServedPathMiddleware';
import getPublicUrlOrPath from 'react-dev-utils/getPublicUrlOrPath';
import { createHash } from 'crypto';
import path, { sep } from 'path';
import { html } from './html';
import { buildDevServiceWorkerScript } from './dev-service-worker';
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
const assetRequestRegex = /^\/.*\.(?:js|css|map|json|txt|ico|png|jpe?g|gif|svg|webp|woff2?|ttf|eot)(?:\?.*)?$/i;
const hotUpdateRequestRegex = /^\/.*hot-update\.(?:js|json)(?:\?.*)?$/i;
const hmrRequestRegex = /^\/(?:sockjs-node|_hmr)(?:\/|$)/i;

export interface RspackConfigWithDevServer extends Configuration {
  devServer: DevServerConfig;
}

export function devConfig(workspaceDir, entryFiles, title): RspackConfigWithDevServer {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);
  const workspaceCacheSuffix = createHash('sha1').update(path.resolve(workspaceDir)).digest('hex').slice(0, 10);
  const workspaceCacheKey = `${title || 'workspace'}-${workspaceCacheSuffix}`;
  const devSessionToken = `${workspaceCacheKey}-${Date.now().toString(36)}`;

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

    // Keep dev-start output readable; detailed diagnostics still surface on compile errors.
    stats: 'errors-warnings',

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
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
        rewrites: [
          {
            from: assetRequestRegex,
            to: (context) => context.parsedUrl.pathname || '/',
          },
          {
            from: hotUpdateRequestRegex,
            to: (context) => context.parsedUrl.pathname || '/',
          },
          {
            from: hmrRequestRegex,
            to: (context) => context.parsedUrl.pathname || '/',
          },
        ],
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

        // Serve a lightweight SW in dev mode so workspace UI can reload from cache
        // while the local dev process is temporarily down.
        middlewares.unshift((req: any, res: any, next: any) => {
          const reqPath = (req.url || '').split('?')[0];
          if (reqPath !== '/service-worker.js') {
            next();
            return;
          }

          res.setHeader('content-type', 'application/javascript; charset=utf-8');
          res.setHeader('cache-control', 'no-store, no-cache, must-revalidate');
          res.statusCode = 200;
          res.end(buildDevServiceWorkerScript());
        });

        // Keep mutable dev bundles uncached to prevent stale-runtime reload loops.
        // Preview assets are cached separately at the proxy layer.
        middlewares.unshift((req: any, res: any, next: any) => {
          const reqPath = (req.url || '').split('?')[0];
          if (/^\/static\/(js|css)\//.test(reqPath)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|eot)(\?.*)?$/i.test(reqPath)) {
            res.setHeader('Cache-Control', 'public, max-age=120');
          }
          next();
        });

        middlewares.push(
          // @ts-ignore @types/wds mismatch
          evalSourceMapMiddleware(devServer),
          errorOverlayMiddleware(),
          redirectServedPath(publicUrlOrPath)
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
        templateContent: html(title || 'My component workspace', false, {
          serviceWorkerMode: 'register',
          workspaceCacheKey,
          serviceWorkerBuildToken: devSessionToken,
          autoReloadOnSwControllerChange: false,
          serviceWorkerDevSessionReset: true,
        })(),
        chunks: ['main'],
        filename: 'index.html',
      }),
      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };
}
