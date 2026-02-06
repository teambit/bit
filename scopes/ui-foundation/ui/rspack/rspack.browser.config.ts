import rspack, { type Configuration } from '@rspack/core';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import path from 'path';
import { postCssConfig } from './postcss.config';
import { html } from './html';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  imageInlineSizeLimit,
  resolveAlias,
  resolveFallback,
  RspackManifestPlugin,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack.common';

/*
 * Rspack production config for the bit ui (replaces webpack.browser.config.ts)
 * i.e. `bit build`, `bit start` (non-dev mode)
 */

export default function createRspackBrowserConfig(
  outputDir: string,
  entryFiles: string[],
  title: string,
  publicDir: string
): Configuration {
  const isEnvProductionProfile = process.argv.includes('--profile');

  return {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode: 'production',

    devtool: shouldUseSourceMap ? 'source-map' : false,

    entry: {
      main: entryFiles,
    },

    output: {
      path: path.resolve(outputDir, publicDir),
      filename: 'static/js/[name].[contenthash:8].js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      publicPath: '/',
    },

    optimization: {
      minimize: true,
      minimizer: [
        new rspack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            compress: { ecma: 5, comparisons: false, inline: 2 },
            mangle: { safari10: true, keep_classnames: true },
            format: { ecma: 5, comments: false, ascii_only: true },
          },
        }),
        new rspack.LightningCssMinimizerRspackPlugin({}),
      ],
      splitChunks: { chunks: 'all', name: false },
      runtimeChunk: { name: (entrypoint) => `runtime-${entrypoint.name}` },
    },

    resolve: {
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: resolveAlias({ profile: isEnvProductionProfile }),
      fallback: resolveFallback,
    },

    module: {
      rules: [
        mjsRule(),
        swcRule(),
        sourceMapRule(),
        // Images
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.svg$/],
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
        },
        fontRule(),
        ...styleRules({
          styleLoader: rspack.CssExtractRspackPlugin.loader,
          sourceMap: shouldUseSourceMap,
          postCssConfig,
          resolveUrlLoader: true,
        }),
        // Catch-all for other assets
        {
          exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/],
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new rspack.CssExtractRspackPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),

      new rspack.HtmlRspackPlugin({
        inject: true,
        templateContent: html(title)(),
        minify: true,
      }),

      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),

      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),

      new RspackManifestPlugin({ fileName: 'asset-manifest.json' }),

      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        navigateFallback: 'public/index.html',
        navigateFallbackDenylist: [new RegExp('^/_'), new RegExp('/[^/.?]+\\.[^/]+$')],
      }),
    ],

    performance: false,
  };
}
