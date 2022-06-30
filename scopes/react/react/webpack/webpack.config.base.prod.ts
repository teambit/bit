import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import { Configuration } from 'webpack';
// import { WebpackManifestPlugin } from 'webpack-manifest-plugin';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (dev?: boolean): Configuration {
  const optimization = dev
    ? undefined
    : {
        minimize: true,
        minimizer: [
          new TerserPlugin({
            minify: TerserPlugin.esbuildMinify,
            // `terserOptions` options will be passed to `esbuild`
            // Link to options - https://esbuild.github.io/api/#minify
            // Note: the `minify` options is true by default (and override other `minify*` options), so if you want to disable the `minifyIdentifiers` option (or other `minify*` options) please use:
            terserOptions: {
              minify: false,
              minifyWhitespace: true,
              // We don't want to minify identifiers to enable easier debugging on remote scopes when there are preview issues
              minifyIdentifiers: false,
              // minifyIdentifiers: true,
              minifySyntax: true,
            },
            // terserOptions: {},
          }),

          // This is only used in production mode
          // new TerserPlugin({
          //   extractComments: false,
          //   terserOptions: {
          //     parse: {
          //       // We want terser to parse ecma 8 code. However, we don't want it
          //       // to apply any minification steps that turns valid ecma 5 code
          //       // into invalid ecma 5 code. This is why the 'compress' and 'output'
          //       // sections only apply transformations that are ecma 5 safe
          //       // https://github.com/facebook/create-react-app/pull/4234
          //       ecma: 8,
          //     },
          //     compress: {
          //       ecma: 5,
          //       warnings: false,
          //       // Disabled because of an issue with Uglify breaking seemingly valid code:
          //       // https://github.com/facebook/create-react-app/issues/2376
          //       // Pending further investigation:
          //       // https://github.com/mishoo/UglifyJS2/issues/2011
          //       comparisons: false,
          //       // Disabled because of an issue with Terser breaking valid code:
          //       // https://github.com/facebook/create-react-app/issues/5250
          //       // Pending further investigation:
          //       // https://github.com/terser-js/terser/issues/120
          //       inline: 2,
          //     },
          //     mangle: {
          //       safari10: true,
          //     },
          //     output: {
          //       ecma: 5,
          //       comments: false,
          //       // Turned on because emoji and regex is not minified properly using default
          //       // https://github.com/facebook/create-react-app/issues/2488
          //       ascii_only: true,
          //     },
          //   },
          // }),
          new CssMinimizerPlugin({
            minimizerOptions: {
              preset: [
                'default',
                {
                  minifyFontValues: { removeQuotes: false },
                },
              ],
            },
          }),
        ],
        // Automatically split vendor and commons
        // https://twitter.com/wSokra/status/969633336732905474
        // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
        // splitChunks: {
        // chunks: 'all',
        // name: false,
        // },
        // Keep the runtime chunk separated to enable long term caching
        // https://twitter.com/wSokra/status/969679223278505985
        // https://github.com/facebook/create-react-app/issues/5358
        // runtimeChunk: {
        // name: (entrypoint) => `runtime-${entrypoint.name}`,
        // },
      };

  return {
    optimization,

    plugins: [
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      //   can be used to reconstruct the HTML if necessary
      // new WebpackManifestPlugin({
      //   fileName: 'asset-manifest.json',
      //   publicPath: 'public',
      //   generate: (seed, files, entrypoints) => {
      //     const manifestFiles = files.reduce((manifest, file) => {
      //       manifest[file.name] = file.path;
      //       return manifest;
      //     }, seed);
      //     const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith('.map'));
      //     // @ts-ignore - https://github.com/shellscape/webpack-manifest-plugin/issues/276
      //     return {
      //       files: manifestFiles,
      //       entrypoints: entrypointFiles,
      //     } as Record<string, string>;
      //   },
      // }),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
    ].filter(Boolean),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
}
