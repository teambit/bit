import { rspack, type Configuration } from '@rspack/core';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import path from 'path';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  resolveAlias,
  resolveFallback,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack.common';

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
    experiments: {
      css: true,
    },

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
      parser: cssParser,
      rules: [
        mjsRule(),
        swcRule(),
        sourceMapRule(),
        fontRule(),
        ...styleRules({
          sourceMap: shouldUseSourceMap,
          resolveUrlLoader: true,
          exportsOnly: true,
        }),
        {
          exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
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
