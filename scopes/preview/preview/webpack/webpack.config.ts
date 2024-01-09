import { configBaseFactory } from '@teambit/react.webpack.react-webpack';

import { Configuration, ProvidePlugin } from 'webpack';
import { merge } from 'webpack-merge';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';

export function createWebpackConfig(outputDir: string, entryFile: string): Configuration {
  const baseConfig = configBaseFactory(true);
  const preBundleConfig = createPreBundleConfig(outputDir, entryFile);

  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, preBundleConfig);

  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

function createPreBundleConfig(outputDir: string, entryFile: string) {
  const preBundleConfig: Configuration = {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode: 'production',
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
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      filename: 'static/js/[name].[contenthash:8].js',
      library: {
        type: 'commonjs2',
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
