import rspack, { type Configuration, type Compiler } from '@rspack/core';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';

/**
 * Simple rspack-compatible manifest plugin (replaces webpack-manifest-plugin which is incompatible with rspack 1.7+).
 * Generates asset-manifest.json with { files: { name: path }, entrypoints: string[] }.
 */
class RspackManifestPlugin {
  private fileName: string;
  constructor(options: { fileName: string }) {
    this.fileName = options.fileName;
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('RspackManifestPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'RspackManifestPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const files: Record<string, string> = {};
          for (const asset of (compilation as any).getAssets()) {
            if (asset.name) files[asset.name] = `/${asset.name}`;
          }
          const stats = compilation.getStats().toJson({ all: false, entrypoints: true });
          const mainEntry = stats.entrypoints?.main;
          const entrypoints = (mainEntry?.assets || [])
            .map((a: any) => a.name || a)
            .filter((name: string) => !name.endsWith('.map'));

          const manifest = JSON.stringify({ files, entrypoints }, null, 2);
          compilation.emitAsset(this.fileName, new compiler.webpack.sources.RawSource(manifest));
        }
      );
    });
  }
}
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import path from 'path';
import { postCssConfig } from './postcss.config';
import { html } from './html';

/*
 * Rspack production config for the bit ui (replaces webpack.browser.config.ts)
 * i.e. `bit build`, `bit start` (non-dev mode)
 */

const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
];

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

export default function createRspackBrowserConfig(
  outputDir: string,
  entryFiles: string[],
  title: string,
  publicDir: string
): Configuration {
  const isEnvProductionProfile = process.argv.includes('--profile');

  return {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode: 'production',

    devtool: shouldUseSourceMap ? 'source-map' : false,

    entry: {
      main: entryFiles,
    },

    output: {
      path: path.resolve(outputDir, publicDir),
      filename: 'static/js/[name].[contenthash:8].js',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.js',
      publicPath: '/',
    },

    optimization: {
      minimize: true,
      minimizer: [
        new rspack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            compress: {
              ecma: 5,
              comparisons: false,
              inline: 2,
            },
            mangle: {
              safari10: true,
              keep_classnames: true,
            },
            format: {
              ecma: 5,
              comments: false,
              ascii_only: true,
            },
          },
        }),
        new rspack.LightningCssMinimizerRspackPlugin({}),
      ],
      splitChunks: {
        chunks: 'all',
        name: false,
      },
      runtimeChunk: {
        name: (entrypoint) => `runtime-${entrypoint.name}`,
      },
    },

    resolve: {
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: {
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        react: require.resolve('react'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        '@teambit/component.ui.component-compare.context': require.resolve(
          '@teambit/component.ui.component-compare.context'
        ),
        '@teambit/base-react.navigation.link': require.resolve('@teambit/base-react.navigation.link'),
        '@teambit/base-ui.graph.tree.recursive-tree': require.resolve('@teambit/base-ui.graph.tree.recursive-tree'),
        '@teambit/semantics.entities.semantic-schema': require.resolve('@teambit/semantics.entities.semantic-schema'),
        '@teambit/code.ui.code-editor': require.resolve('@teambit/code.ui.code-editor'),
        '@teambit/api-reference.hooks.use-api': require.resolve('@teambit/api-reference.hooks.use-api'),
        '@teambit/api-reference.hooks.use-api-renderers': require.resolve(
          '@teambit/api-reference.hooks.use-api-renderers'
        ),
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

    module: {
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        // TypeScript and JSX files - use rspack's builtin SWC loader (much faster than babel)
        {
          test: /\.(js|mjs|jsx|ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                  },
                },
                target: 'es2015',
              },
            },
          },
          type: 'javascript/auto',
        },
        // Bit component JS files in node_modules - need source maps
        {
          test: /\.js$/,
          enforce: 'pre' as const,
          include: /node_modules/,
          descriptionData: { componentId: (value) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        // Images
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.svg$/],
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        // Font files
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          type: 'asset',
          generator: {
            filename: 'static/fonts/[hash][ext][query]',
          },
        },
        // CSS non-modules (*.css but NOT *.module.css)
        {
          test: stylesRegexps.cssNoModulesRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
          ],
          sideEffects: true,
        },
        // CSS modules (*.module.css)
        {
          test: stylesRegexps.cssModuleRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
          ],
        },
        // SASS/SCSS non-modules (*.scss / *.sass but NOT *.module.scss)
        {
          test: stylesRegexps.sassNoModuleRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 3,
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
            {
              loader: require.resolve('resolve-url-loader'),
              options: {
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true, // required for resolve-url-loader
              },
            },
          ],
          sideEffects: true,
        },
        // SASS/SCSS modules (*.module.scss / *.module.sass)
        {
          test: stylesRegexps.sassModuleRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 3,
                sourceMap: shouldUseSourceMap,
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
            {
              loader: require.resolve('resolve-url-loader'),
              options: {
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        // LESS non-modules (*.less but NOT *.module.less)
        {
          test: stylesRegexps.lessNoModuleRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
            {
              loader: require.resolve('resolve-url-loader'),
              options: {
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
          sideEffects: true,
        },
        // LESS modules (*.module.less)
        {
          test: stylesRegexps.lessModuleRegex,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
              },
            },
            {
              loader: require.resolve('postcss-loader'),
              options: postCssConfig,
            },
            {
              loader: require.resolve('resolve-url-loader'),
              options: {
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        // Catch-all for other assets
        {
          exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/],
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new rspack.CssExtractRspackPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),

      new rspack.HtmlRspackPlugin({
        inject: true,
        templateContent: html(title)(),
        minify: true,
      }),

      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),

      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),

      new RspackManifestPlugin({ fileName: 'asset-manifest.json' }),

      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        navigateFallback: 'public/index.html',
        navigateFallbackDenylist: [new RegExp('^/_'), new RegExp('/[^/?]+\\.[^/]+$')],
      }),
    ],

    performance: false,
  };
}
