import rspack, { type Configuration } from '@rspack/core';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import path from 'path';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
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
