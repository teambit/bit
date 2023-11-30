import { Configuration } from 'webpack';
import path from 'path';
import { merge } from 'webpack-merge';
// import { configBaseFactory } from '@teambit/react.webpack.react-webpack';
// import { fallbacks } from '@teambit/webpack';
// import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
// import WorkboxWebpackPlugin from 'workbox-webpack-plugin';
import createBaseConfig from './webpack.base.config';

export default function createWebpackConfig(
  workspaceDir: string,
  entryFiles: string[],
  publicDir: string
): Configuration {
  const baseConfig = createBaseConfig(workspaceDir, entryFiles);
  const ssrConfig = createSsrConfig(workspaceDir, publicDir);
  // const baseConfig = configBaseFactory(true);
  // const ssrConfig = createSsrConfig(workspaceDir, publicDir, entryFiles);
  // @ts-ignore that's an issue because of different types/webpack version
  const combined = merge(baseConfig, ssrConfig);
  // @ts-ignore that's an issue because of different types/webpack version
  return combined;
}

// function createSsrConfig(workspaceDir: string, publicDir: string, entryFiles: string[]) {
function createSsrConfig(workspaceDir: string, publicDir: string) {
  const ssrConfig: Configuration = {
    // entry: {
    //   main: entryFiles,
    // },
    target: 'node',
    devtool: 'eval-cheap-module-source-map',

    output: {
      path: path.resolve(workspaceDir, publicDir, 'ssr'),
      publicPath: '/public/ssr/',
      libraryTarget: 'commonjs',
      filename: 'index.js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
    },
    // resolve: {
    //   alias: {
    //     'react/jsx-runtime': require.resolve('react/jsx-runtime'),
    //     react: require.resolve('react'),
    //     'react-dom': require.resolve('react-dom'),
    //   },
    //   fallback: {
    //     module: false,
    //     path: fallbacks.path,
    //     dgram: false,
    //     dns: false,
    //     fs: false,
    //     stream: false,
    //     http2: false,
    //     net: false,
    //     tls: false,
    //     child_process: false,
    //     process: fallbacks.process,
    //   },
    // },

    // // no optimizations for ssr at this point,
    // // especially no chunks.
    // optimization: { },

    // plugins: [
    //   // Generate an asset manifest file with the following content:
    //   // - "files" key: Mapping of all asset filenames to their corresponding
    //   //   output file so that tools can pick it up without having to parse
    //   //   `index.html`
    //   //   can be used to reconstruct the HTML if necessary
    //   new WebpackManifestPlugin({
    //     fileName: 'asset-manifest.json',
    //     generate: (seed, files, entrypoints) => {
    //       const manifestFiles = files.reduce((manifest, file) => {
    //         manifest[file.name] = file.path;
    //         return manifest;
    //       }, seed);
    //       const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith('.map'));

    //       // @ts-ignore - https://github.com/shellscape/webpack-manifest-plugin/issues/276
    //       return {
    //         files: manifestFiles,
    //         entrypoints: entrypointFiles,
    //       } as Record<string, string>;
    //     },
    //   }),

    //   // Generate a service worker script that will precache, and keep up to date,
    //   // the HTML & assets that are part of the webpack build.
    //   new WorkboxWebpackPlugin.GenerateSW({
    //     clientsClaim: true,
    //     maximumFileSizeToCacheInBytes: 5000000,
    //     exclude: [/\.map$/, /asset-manifest\.json$/],
    //     // importWorkboxFrom: 'cdn',
    //     navigateFallback: 'public/index.html',
    //     navigateFallbackDenylist: [
    //       // Exclude URLs starting with /_, as they're likely an API call
    //       new RegExp('^/_'),
    //       // Exclude any URLs whose last part seems to be a file extension
    //       // as they're likely a resource and not a SPA route.
    //       // URLs containing a "?" character won't be blacklisted as they're likely
    //       // a route with query params (e.g. auth callbacks).
    //       new RegExp('/[^/?]+\\.[^/]+$'),
    //     ],
    //   }),
    // ],
  };

  return ssrConfig;
}
