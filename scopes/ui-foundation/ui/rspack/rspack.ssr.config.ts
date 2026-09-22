import { rspack, type Configuration } from '@rspack/core';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import path from 'path';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  resolveAlias,
  resolveFallback,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack.common';

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
    // this bundle ships inside the package, so it follows the browser config's opt-in: the `eval-*`
    // devtools inline a base64 source map per module, which was 60% of the 37 MB `ssr/index.js`.
    devtool: shouldUseSourceMap ? 'source-map' : false,
    experiments: {
      css: true,
    },

    optimization: {
      minimize: true,
      minimizer: [
        new rspack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            compress: { ecma: 5, comparisons: false, inline: 2 },
            // `keep_classnames` for the same reason as the browser build - react resolves component
            // names from the class name, and the ssr output is rendered by the same components.
            mangle: { safari10: true, keep_classnames: true },
            format: { ecma: 5, comments: false, ascii_only: true },
          },
        }),
      ],
    },

    entry: {
      main: entryFiles,
    },

    // same rationale as the browser config: `@teambit/ui`'s barrel re-exports `BundleUiTask`
    // (a real value, not `export type`), which pulls in `ui-vendor-dll.ts` and its `@rspack/core`
    // import. Every aspect requires `@teambit/ui` via CJS just to get its aspect id, and rspack
    // can't prove that CJS require's `BundleUiTask`/vendor-dll exports go unused, so without this it
    // bundles the whole chain in - including `@rspack/core`'s ~40 MB native binding - even though
    // nothing on the actual render path ever calls those build-only helpers. Externalizing it here
    // (this target is `node`, so a plain `require` would resolve from the installed externals if it
    // ever ran) removes it from the bundle; verified with `--ui-bundling` off (so `@rspack/core`
    // isn't even installed) that the `require` is never reached at runtime - `bit-bundle3`'s own
    // `ui-ssr.e2e.ts`/`ui-start.e2e.ts` pass clean against that build. Without this the ssr bundle
    // balloons by ~50 MB for zero runtime benefit (bundle-plan.md §14, 2026-09-07).
    externals: {
      '@rspack/core': 'commonjs @rspack/core',
      '@teambit/aspect-loader': 'commonjs @teambit/aspect-loader',
      '@teambit/webpack': 'commonjs @teambit/webpack',
      'postcss-loader': 'commonjs postcss-loader',
      'postcss-preset-env': 'commonjs postcss-preset-env',
      'resolve-url-loader': 'commonjs resolve-url-loader',
      'sass-loader': 'commonjs sass-loader',
      'rspack-manifest-plugin': 'commonjs rspack-manifest-plugin',
      'postcss-normalize': 'commonjs postcss-normalize',
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
      alias: resolveAlias({ profile: isEnvProductionProfile }),
      fallback: resolveFallback,
    },

    module: {
      parser: cssParser,
      rules: [
        mjsRule(),
        swcRule(),
        sourceMapRule(),
        fontRule(),
        ...styleRules({
          sourceMap: shouldUseSourceMap,
          resolveUrlLoader: true,
          exportsOnly: true,
        }),
        {
          // `cjs` must be excluded here exactly as it is in the browser config. without it a `.cjs`
          // module is emitted as an asset and its module value becomes the emitted file's url, so a
          // component imported from one renders as `<"/public/ssr/<hash>.cjs" />` and react throws
          // "Invalid tag" (#65) on every request - which the ssr middleware swallows, silently
          // falling back to the client-rendered html.
          exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
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
