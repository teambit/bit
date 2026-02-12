import { configBaseFactory } from '@teambit/react.webpack.react-webpack';

import type { Configuration } from 'webpack';
import { ProvidePlugin } from 'webpack';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';

export function createWebpackConfig(outputDir: string, entryFile: string): Configuration {
  const baseConfig = configBaseFactory(true);
  const preBundleConfig = createPreBundleConfig(outputDir, entryFile);

  const combined = merge(baseConfig, preBundleConfig);

  return combined;
}

function createPreBundleConfig(outputDir: string, entryFile: string) {
  const mode = process.env.BIT_DEBUG_PREVIEW_BUNDLE ? 'development' : 'production';
  const preBundleConfig: Configuration = {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode,
    entry: {
      main: entryFile,
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
      path: outputDir,
      publicPath: '/',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.cjs',
      filename: 'static/js/[name].[contenthash:8].cjs',
      library: {
        type: 'commonjs-static',
      },
    },
    externalsType: 'commonjs',
    externals: ['react', 'react-dom', '@mdx-js/react', '@teambit/mdx.ui.mdx-scope-context'],
    plugins: [
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

      new ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    ],
  };

  return preBundleConfig;
}
