import { IgnorePlugin, Configuration } from 'webpack';
import path from 'path';
import merge from 'webpack-merge';

import createBaseConfig from './webpack.base.config';

export default function createWebpackConfig(workspaceDir: string, entryFiles: string[]): Configuration {
  const baseConfig = createBaseConfig(workspaceDir, entryFiles);
  const ssrConfig = createSsrConfig(workspaceDir);

  const combined = merge(baseConfig, ssrConfig);

  return combined;
}

function createSsrConfig(workspaceDir: string) {
  const ssrConfig: Configuration = {
    target: 'node',
    devtool: 'cheap-eval-source-map', // TODO

    // entry: {
    //   main: mainFiles[0],
    // },

    output: {
      path: path.resolve(workspaceDir, 'public/ssr'),
      publicPath: '/public/ssr/',
      libraryTarget: 'commonjs',
      filename: 'index.js',
    },

    // // no optimizations for ssr at this point,
    // // especially no chunks.
    // optimization: { },

    plugins: [
      // TODO - replace mutation-observer
      new IgnorePlugin({
        resourceRegExp: /^mutation-observer$/,
      }),
    ],
  };

  return ssrConfig;
}
