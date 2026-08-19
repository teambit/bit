import { rspack, type Configuration } from '@rspack/core';
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
  generateAssetManifest,
  cssParser,
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

export type BrowserEntry = {
  /** entry name; also names the emitted html (`<name>.html`) */
  name: string;
  files: string[];
  title: string;
};

export default function createRspackBrowserConfig(
  outputDir: string,
  entries: BrowserEntry[],
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
    experiments: {
      css: true,
    },

    entry: Object.fromEntries(
      (() => {
        // `Object.fromEntries` would silently keep only the last of two entries sharing a name, and
        // the lost root would then have no chunks and no document while still looking built.
        const seen = new Set<string>();
        return entries.map((entry) => {
          if (seen.has(entry.name)) throw new Error(`duplicate ui bundle entry name: "${entry.name}"`);
          seen.add(entry.name);
          return [entry.name, entry.files] as const;
        });
      })()
    ),

    output: {
      path: path.resolve(outputDir, publicDir),
      filename: 'static/js/[name].[contenthash:8].js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      cssFilename: 'static/css/[name].[contenthash:8].css',
      cssChunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
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
      parser: cssParser,
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
          sourceMap: shouldUseSourceMap,
          postCssConfig,
          resolveUrlLoader: true,
        }),
        // Catch-all for other assets
        {
          exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      // one html per entry, each injecting only its own entry's chunks. `index.html` is no longer
      // emitted: with two roots in one compilation there is no single default document, so the ui
      // server falls back to `<entry>.html` for the root it is serving.
      ...entries.map(
        (entry) =>
          new rspack.HtmlRspackPlugin({
            filename: `${entry.name}.html`,
            chunks: [entry.name],
            inject: true,
            templateContent: html(entry.title)(),
            minify: true,
          })
      ),

      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),

      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),

      new RspackManifestPlugin({ fileName: 'asset-manifest.json', generate: generateAssetManifest }),

      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        // no `navigateFallback`: with an entry per UI root there is no single app shell to fall back
        // to, and the previous value (`public/index.html`) now names a document this build does not
        // emit - the service worker would answer navigations with a missing file. the express
        // history-api fallback already serves the right `<root>.html`, so navigations go to the
        // network instead of through a shell the service worker cannot supply.
      }),
    ],

    performance: false,
  };
}
