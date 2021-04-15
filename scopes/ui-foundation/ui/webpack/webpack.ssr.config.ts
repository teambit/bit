import { Configuration } from 'webpack';
import path from 'path';
import { merge } from 'webpack-merge';

import createBaseConfig from './webpack.base.config';

export default function createWebpackConfig(
  workspaceDir: string,
  entryFiles: string[],
  publicDir: string
): Configuration {
  const baseConfig = createBaseConfig(workspaceDir, entryFiles);
  const ssrConfig = createSsrConfig(workspaceDir, publicDir);

  const combined = merge(baseConfig, ssrConfig);

  return combined;
}

function createSsrConfig(workspaceDir: string, publicDir: string) {
  const ssrConfig: Configuration = {
    target: 'node',
    devtool: 'eval-cheap-source-map', // TODO

    output: {
      path: path.resolve(workspaceDir, publicDir, 'ssr'),
      publicPath: '/public/ssr/',
      libraryTarget: 'commonjs',
      filename: 'index.js',
    },

    // // no optimizations for ssr at this point,
    // // especially no chunks.
    // optimization: { },
  };

  return ssrConfig;
}
