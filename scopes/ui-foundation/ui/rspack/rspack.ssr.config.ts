import { rspack, type Configuration } from '@rspack/core';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import path from 'path';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  resolveAlias,
  resolveFallback,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack.common';

/*
 * Rspack SSR config for the bit ui (replaces webpack.ssr.config.ts)
 * Used for Scope UI SSR builds: outputs a CommonJS Node bundle at {publicDir}/ssr/index.js
 */

export default function createRspackSsrConfig(
  workspaceDir: string,
  entryFiles: string[],
  publicDir: string
): Configuration {
  const isEnvProductionProfile = process.argv.includes('--profile');

  return {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode: 'production',
    target: 'node',
    devtool: 'eval-cheap-module-source-map',

    entry: {
      main: entryFiles,
    },

    output: {
      path: path.resolve(workspaceDir, publicDir, 'ssr'),
      publicPath: '/public/ssr/',
      library: { type: 'commonjs' },
      filename: 'index.js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
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
        fontRule(),
        // SSR: use null-loader for styles (Node doesn't need CSS extraction)
        ...styleRules({
          styleLoader: require.resolve('null-loader'),
          sourceMap: shouldUseSourceMap,
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
      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
    ],

    performance: false,
  };
}
