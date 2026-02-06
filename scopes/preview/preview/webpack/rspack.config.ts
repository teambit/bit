import rspack, { type Configuration, type Compiler } from '@rspack/core';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';

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
  'mdx',
  'md',
];

const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';
const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

export function createRspackConfig(outputDir: string, entryFile: string): Configuration {
  const mode = process.env.BIT_DEBUG_PREVIEW_BUNDLE ? 'development' : 'production';

  return {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode,

    devtool: shouldUseSourceMap ? 'source-map' : false,

    entry: {
      main: entryFile,
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

    resolve: {
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
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

    optimization: {
      minimize: mode === 'production',
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
    },

    module: {
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        // TypeScript and JSX - use rspack's builtin SWC loader
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
        // Source maps for Bit component files in node_modules
        {
          test: /\.js$/,
          enforce: 'pre' as const,
          include: /node_modules/,
          descriptionData: { componentId: (value: any) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        // Images
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        // SVG as asset
        {
          test: /\.svg$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        // CSS non-modules
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
              },
            },
          ],
          sideEffects: true,
        },
        // CSS modules
        {
          test: /\.module\.css$/,
          use: [
            require.resolve('style-loader'),
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
          ],
        },
        // SASS/SCSS non-modules
        {
          test: /\.(scss|sass)$/,
          exclude: /\.module\.(scss|sass)$/,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 3,
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('resolve-url-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
            {
              loader: require.resolve('sass-loader'),
              options: { sourceMap: true },
            },
          ],
          sideEffects: true,
        },
        // SASS/SCSS modules
        {
          test: /\.module\.(scss|sass)$/,
          use: [
            require.resolve('style-loader'),
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
              loader: require.resolve('resolve-url-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
            {
              loader: require.resolve('sass-loader'),
              options: { sourceMap: true },
            },
          ],
        },
        // LESS non-modules
        {
          test: /\.less$/,
          exclude: /\.module\.less$/,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                importLoaders: 1,
                sourceMap: shouldUseSourceMap,
              },
            },
            {
              loader: require.resolve('less-loader'),
              options: { sourceMap: true },
            },
          ],
          sideEffects: true,
        },
        // LESS modules
        {
          test: /\.module\.less$/,
          use: [
            require.resolve('style-loader'),
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
              loader: require.resolve('less-loader'),
              options: { sourceMap: true },
            },
          ],
        },
        // Font files
        {
          test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
          type: 'asset',
          generator: {
            filename: 'static/fonts/[hash][ext][query]',
          },
        },
        // MDX support
        {
          test: /\.mdx?$/,
          use: [
            {
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
            {
              loader: require.resolve('@mdx-js/loader'),
            },
          ],
          type: 'javascript/auto',
        },
        // Catch-all for other assets
        {
          exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/, /\.mdx?$/],
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new RspackManifestPlugin({ fileName: 'asset-manifest.json' }),

      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),

      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
    ],

    performance: false,
  };
}
