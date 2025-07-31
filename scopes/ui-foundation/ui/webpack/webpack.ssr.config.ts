import type { Configuration } from 'webpack';
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
  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, ssrConfig);
  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

function createSsrConfig(workspaceDir: string, publicDir: string) {
  const ssrConfig: Configuration = {
    target: 'node',
    devtool: 'eval-cheap-module-source-map',

    output: {
      path: path.resolve(workspaceDir, publicDir, 'ssr'),
      publicPath: '/public/ssr/',
      libraryTarget: 'commonjs',
      filename: 'index.js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
    },
  };

  return ssrConfig;
}
