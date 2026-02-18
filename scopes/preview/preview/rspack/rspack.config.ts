import { rspack, type Configuration } from '@rspack/core';
import { fallbacksProvidePluginConfig, fallbacks } from '@teambit/webpack';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';
import { RspackManifestPlugin } from 'rspack-manifest-plugin';
import { generateAssetManifest } from '@teambit/rspack.modules.generate-asset-manifest';

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

const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');
const cssModuleGenerator = { localIdentName: '[name]__[local]--[hash:base64:5]', esModule: false };
const cssParser = {
  css: { namedExports: false },
  'css/auto': { namedExports: false },
  'css/module': { namedExports: false },
} as const;

export function createRspackConfig(outputDir: string, entryFile: string): Configuration {
  const mode = process.env.BIT_DEBUG_PREVIEW_BUNDLE ? 'development' : 'production';
  const shouldUseSourceMap = mode === 'development' || process.env.GENERATE_SOURCEMAP === 'true';

  return {
    stats: {
      children: true,
      errorDetails: true,
    },
    mode,

    devtool: shouldUseSourceMap ? 'source-map' : false,
    experiments: {
      css: true,
    },

    entry: {
      main: entryFile,
    },

    output: {
      path: outputDir,
      publicPath: '/',
      chunkFilename: 'static/js/[name].[contenthash:8].chunk.cjs',
      filename: 'static/js/[name].[contenthash:8].cjs',
      cssFilename: 'static/css/[name].[contenthash:8].css',
      cssChunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
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
            // We need to keep class names and disable mangling to prevent issues with consuming the rspack bundle in
            // other bundlers (e.g. webpack) that rely on class names for tree shaking and other optimizations.
            mangle: false,
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
      parser: cssParser,
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
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
        {
          test: /\.js$/,
          enforce: 'pre' as const,
          include: /node_modules/,
          descriptionData: { componentId: (value: any) => !!value },
          extractSourceMap: shouldUseSourceMap,
        },
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        {
          test: /\.svg$/,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          type: 'css',
          sideEffects: true,
        },
        {
          test: /\.module\.css$/,
          type: 'css/module',
          generator: cssModuleGenerator,
        },
        {
          test: /\.(scss|sass)$/,
          exclude: /\.module\.(scss|sass)$/,
          use: [
            {
              loader: require.resolve('resolve-url-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
            {
              loader: require.resolve('sass-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
          ],
          type: 'css',
          sideEffects: true,
        },
        {
          test: /\.module\.(scss|sass)$/,
          use: [
            {
              loader: require.resolve('resolve-url-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
            {
              loader: require.resolve('sass-loader'),
              options: { sourceMap: shouldUseSourceMap },
            },
          ],
          type: 'css/module',
          generator: cssModuleGenerator,
        },
        {
          test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
          type: 'asset',
          generator: {
            filename: 'static/fonts/[hash][ext][query]',
          },
        },
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
              options: mdxOptions,
            },
            {
              // transforms admonition syntax (:::type content → :::type[content]) for mdx v3
              loader: require.resolve('@teambit/react/dist/webpack/mdx-pre-loader.cjs'),
            },
          ],
          type: 'javascript/auto',
        },
        {
          exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/, /\.mdx?$/],
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new RspackManifestPlugin({ fileName: 'asset-manifest.json', generate: generateAssetManifest }),

      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),

      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
    ],

    performance: false,
  };
}
