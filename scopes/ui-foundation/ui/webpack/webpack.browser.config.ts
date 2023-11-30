import { Configuration, ProvidePlugin } from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import { configBaseFactory } from '@teambit/react.webpack.react-webpack';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';
import { html } from './html';

export default function createWebpackConfig(
  outputDir: string,
  entryFiles: string[],
  title: string,
  publicDir: string
): Configuration {
  const baseConfig = configBaseFactory(true);
  const browserConfig = createBrowserConfig(outputDir, title, publicDir, entryFiles);
  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, browserConfig);
  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

function createBrowserConfig(outputDir: string, title: string, publicDir: string, entryFiles: string[]) {
  const browserConfig: Configuration = {
    // target: 'web', // already default
    mode: 'production',
    entry: {
      main: entryFiles,
    },
    resolve: {
      alias: {
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
      },
      fallback: {
        module: false,
        path: fallbacks.path,
        dgram: false,
        dns: false,
        fs: false,
        stream: false,
        http2: false,
        net: false,
        tls: false,
        child_process: false,
        process: fallbacks.process,
      },
    },
    output: {
      path: path.resolve(outputDir, publicDir),
      filename: 'static/js/[name].[contenthash:8].js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: '/',
    },

    optimization: {
      minimize: true,
      minimizer: [
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            // this ensures the Class Names for all Schema Classes is not minimized
            // so that schemaObjToClass can match the correct Class Name during runtime
            keep_classnames: new RegExp('.*(Schema)$'),
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
        }),
        new CssMinimizerPlugin({
          minimizerOptions: {
            preset: [
              'default',
              {
                minifyFontValues: { removeQuotes: false },
              },
            ],
          },
        }),
      ],
      // Automatically split vendor and commons
      // https://twitter.com/wSokra/status/969633336732905474
      // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
      splitChunks: {
        chunks: 'all',
        name: false,
      },
      // Keep the runtime chunk separated to enable long term caching
      // https://twitter.com/wSokra/status/969679223278505985
      // https://github.com/facebook/create-react-app/issues/5358
      runtimeChunk: {
        name: (entrypoint) => `runtime-${entrypoint.name}`,
      },
    },

    plugins: [
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: html(title),

        minify: {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        },
      }),

      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      //   can be used to reconstruct the HTML if necessary
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith('.map'));

          // @ts-ignore - https://github.com/shellscape/webpack-manifest-plugin/issues/276
          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          } as Record<string, string>;
        },
      }),

      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        // importWorkboxFrom: 'cdn',
        navigateFallback: 'public/index.html',
        navigateFallbackDenylist: [
          // Exclude URLs starting with /_, as they're likely an API call
          new RegExp('^/_'),
          // Exclude any URLs whose last part seems to be a file extension
          // as they're likely a resource and not a SPA route.
          // URLs containing a "?" character won't be blacklisted as they're likely
          // a route with query params (e.g. auth callbacks).
          new RegExp('/[^/?]+\\.[^/]+$'),
        ],
      }),

      new ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };

  return browserConfig;
}
