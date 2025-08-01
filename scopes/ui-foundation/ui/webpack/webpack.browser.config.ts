import type { Configuration } from 'webpack';
import { ProvidePlugin } from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import { html } from './html';
import createBaseConfig from './webpack.base.config';

export default function createWebpackConfig(
  outputDir: string,
  entryFiles: string[],
  title: string,
  publicDir: string
): Configuration {
  const baseConfig = createBaseConfig(outputDir, entryFiles);
  const browserConfig = createBrowserConfig(outputDir, title, publicDir);
  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, browserConfig);
  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

function createBrowserConfig(outputDir: string, title: string, publicDir: string) {
  const browserConfig: Configuration = {
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

      new ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };

  return browserConfig;
}
