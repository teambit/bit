import rspack, { type Configuration } from '@rspack/core';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import path from 'path';
import { postCssConfig } from './postcss.config';
import { html } from './html';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  imageInlineSizeLimit,
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
      alias: {
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
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
