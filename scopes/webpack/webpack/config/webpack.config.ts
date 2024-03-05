/* eslint-disable complexity */
import webpack, { Configuration } from 'webpack';
// import { writeFileSync } from 'fs';
import { isUndefined, omitBy } from 'lodash';
// import CompressionPlugin from 'compression-webpack-plugin';
import { sep } from 'path';
import type { BundlerContext, BundlerHtmlConfig, Target } from '@teambit/bundler';
import HtmlWebpackPlugin from 'html-webpack-plugin';
// import WebpackAssetsManifest from 'webpack-assets-manifest';
import { fallbacks } from './webpack-fallbacks';
import { fallbacksProvidePluginConfig } from './webpack-fallbacks-provide-plugin-config';
import { fallbacksAliases } from './webpack-fallbacks-aliases';

const SCOPES = {
  API_REFERENCE: 'teambit.api-reference', // 62
  REACT: 'teambit.react', // 20
  COMPONENT: 'teambit.component', // 24
  LANES: 'teambit.lanes', // 16
  CODE: 'teambit.code', // 4
  CLOUD: 'teambit.cloud', // 4
  PREVIEW: 'teambit.preview', // 4
  DEFENDER: 'teambit.defender', // 4
  HARMONY: 'teambit.harmony', // 4
  SCOPE: 'teambit.scope', // 2
  WORKSPACE: 'teambit.workspace', // 2
  COMPOSITIONS: 'teambit.compositions', // 2
  ENVS: 'teambit.envs', // 2
  DOCS: 'teambit.docs', // 2
  UI_FOUNDATION: 'teambit.ui-foundation', // 2
};

export function configFactory(target: Target, context: BundlerContext): Configuration {
  let truthyEntries =
    Array.isArray(target.entries) && target.entries.length ? target.entries.filter(Boolean) : target.entries || {};
  if (Array.isArray(truthyEntries) && !truthyEntries.length) {
    truthyEntries = {};
  }

  if (Object.keys(truthyEntries).length > 0 && !Array.isArray(truthyEntries)) {
    truthyEntries = Object.keys(truthyEntries).reduce((acc, entryKey) => {
      if (entryKey.includes(SCOPES.COMPONENT)) {
        acc[entryKey] = truthyEntries[entryKey];
      }
      return acc;
    }, {});
  }

  // if(Object.keys(truthyEntries).length > 3) {
  //   const fileContent = Object.values(truthyEntries).reduce((acc, entryVal) => {
  //     acc += `import "${entryVal.import}"\n`;
  //     return acc;
  //   }, '');

  //   console.log('rootPath', context.rootPath);

  //   writeFileSync('./entries-index.js', fileContent);
  //   console.log(
  //     '🚀 ~ file: webpack.config.ts:33 ~ configFactory ~ writeFileSync: Generated file at',
  //     require.resolve('./entries-index.js')
  //   );

  //   truthyEntries = ['./entries-index.js'];
  // }

  const dev = Boolean(context.development);
  const htmlConfig = target.html ?? context.html;
  const compress = target.compress ?? context.compress;
  const htmlPlugins = htmlConfig ? generateHtmlPlugins(htmlConfig) : undefined;
  const splitChunks = target.chunking?.splitChunks;

  const config: Configuration = {
    mode: dev ? 'development' : 'production',
    // Stop compilation early in production
    bail: true,
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    // @ts-ignore
    entry: truthyEntries,

    infrastructureLogging: {
      level: 'error',
    },

    output: {
      // The build folder.
      path: `${target.outputPath}${sep}public`,
    },
    stats: {
      errorDetails: true,
    },

    resolve: {
      // TODO - check - we should not need both fallbacks and alias and provider plugin
      alias: fallbacksAliases,

      fallback: fallbacks,
    },

    plugins: [new webpack.ProvidePlugin(fallbacksProvidePluginConfig)],
    // plugins: [new webpack.ProvidePlugin(fallbacksProvidePluginConfig), getAssetManifestPlugin()],
  };

  if (target.filename) {
    config.output = config.output || {};
    config.output.filename = target.filename;
  }

  if (target.chunkFilename) {
    config.output = config.output || {};
    config.output.chunkFilename = target.chunkFilename;
  }

  if (target.runtimeChunkName) {
    config.optimization = config.optimization || {};
    config.optimization.runtimeChunk = {
      name: target.runtimeChunkName,
    };
  }

  if (splitChunks) {
    config.optimization = config.optimization || {};
    config.optimization.splitChunks = {
      chunks: 'all',
      name: false,
    };
  }

  if (htmlPlugins && htmlPlugins.length) {
    if (!config.plugins) {
      config.plugins = [];
    }
    config.plugins = config.plugins.concat(htmlPlugins);
  }
  // if (compress) {
  //   if (!config.plugins) {
  //     config.plugins = [];
  //   }
  //   config.plugins = config.plugins.concat(new CompressionPlugin());
  // }

  if (!config.plugins) {
    config.plugins = [];
  }
  config.plugins = config.plugins.concat(
    new webpack.debug.ProfilingPlugin({
      // outputPath: `${target.outputPath}${sep}public/profiling/profileEvents.json`,
      outputPath: `/tmp/profiling/profileEvents.json`,
    })
  );

  return config;
}

// function getAssetManifestPlugin() {
//   return new WebpackAssetsManifest({ entrypoints: true });
// }

function generateHtmlPlugins(configs: BundlerHtmlConfig[]) {
  return configs.map((config) => generateHtmlPlugin(config));
}

function generateHtmlPlugin(config: BundlerHtmlConfig) {
  const baseConfig: HtmlWebpackPlugin.Options = {
    filename: config.filename,
    chunks: config.chunks,
    chunksSortMode: config.chunkOrder,
    title: config.title,
    templateContent: config.templateContent,
    minify: config.minify,
    cache: false,
    favicon: config.favicon,
  };

  const filteredConfig = omitBy(baseConfig, isUndefined);
  return new HtmlWebpackPlugin(filteredConfig);
}
