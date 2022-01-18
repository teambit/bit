import camelcase from 'camelcase';
import webpack, { Configuration } from 'webpack';
import { generateExternals } from '@teambit/webpack.modules.generate-externals';
import type { BundlerContext, BundlerHtmlConfig, Target } from '@teambit/bundler';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { fallbacks } from './webpack-fallbacks';
import { fallbacksProvidePluginConfig } from './webpack-fallbacks-provide-plugin-config';
import { fallbacksAliases } from './webpack-fallbacks-aliases';

export function configFactory(target: Target, context: BundlerContext): Configuration {
  const truthyEntries =
    Array.isArray(target.entries) && target.entries.length ? target.entries.filter(Boolean) : target.entries || {};
  const dev = Boolean(context.development);
  const htmlPlugins = target.html ? generateHtmlPlugins(target.html) : undefined;
  const shouldExternalizePeers = target.externalizePeer && target.peers && target.peers.length;
  const externals = shouldExternalizePeers ? (getExternals(target.peers || []) as any) : undefined;

  const config: Configuration = {
    mode: dev ? 'development' : 'production',
    // Stop compilation early in production
    bail: true,
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    // @ts-ignore
    entry: truthyEntries,

    optimization: {
      runtimeChunk: {
        name: 'runtime',
      },
      splitChunks: {
        chunks: 'all',
        name: false,
      },
    },

    infrastructureLogging: {
      level: 'error',
    },

    output: {
      // The build folder.
      path: `${target.outputPath}/public`,

      filename: target.filename || 'static/js/[name].[contenthash:8].js',
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: target.chunkFilename || 'static/js/[name].[contenthash:8].chunk.js',
    },

    resolve: {
      alias: fallbacksAliases,

      fallback: fallbacks,
    },

    plugins: [new webpack.ProvidePlugin(fallbacksProvidePluginConfig)],
  };

  if (htmlPlugins && htmlPlugins.length) {
    if (!config.plugins) {
      config.plugins = [];
    }
    config.plugins = config.plugins.concat(htmlPlugins);
  }
  if (externals) {
    config.externals = externals;
  }
  return config;
}

function generateHtmlPlugins(configs: BundlerHtmlConfig[]) {
  return configs.map((config) => generateHtmlPlugin(config));
}
function generateHtmlPlugin(config: BundlerHtmlConfig) {
  const baseConfig = {
    filename: config.filename,
    chunks: config.chunks,
    title: config.title,
    templateContent: config.templateContent,
    minify: config.minify,
    cache: false,
    chunksSortMode: 'auto' as const,
  };
  if (baseConfig.chunks && baseConfig.chunks.length) {
    // Make sure the order is that the preview root coming after the preview def
    // we can't make it like this on the entries using depend on because this will
    // prevent the splitting between different preview defs
    // @ts-ignore
    baseConfig.chunksSortMode = 'manual' as const;
  }
  return new HtmlWebpackPlugin(baseConfig);
}

export function getExternals(deps: string[]) {
  return generateExternals(deps, {
    transformName: (depName) => camelcase(depName.replace('@', '').replace('/', '-'), { pascalCase: true }),
  });
}
