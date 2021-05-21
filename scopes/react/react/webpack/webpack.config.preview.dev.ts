import '@teambit/mdx.ui.mdx-scope-context';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import { ComponentID } from '@teambit/component-id';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import webpack from 'webpack';
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';

import type { WebpackConfigWithDevServer } from '@teambit/webpack';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as mdxLoader from '@teambit/mdx.modules.mdx-loader';
// Make sure the bit-react-transformer is a dependency
// TODO: remove it once we can set policy from component to component then set it via the component.json
import '@teambit/react.babel.bit-react-transformer';

/*
 * Webpack config for Preview Dev mode,
 * i.e. bundle docs & compositions for react components in a local workspace.
 */

const moduleFileExtensions = [
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.mjs',
  'mjs',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
  'mdx',
  'md',
];

type Options = { envId: string; fileMapPath: string; workDir: string };

const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

export default function ({ envId, fileMapPath, workDir }: Options): WebpackConfigWithDevServer {
  return {
    devServer: {
      // @ts-ignore - remove this once there is types package for webpack-dev-server v4
      client: {
        path: `_hmr/${envId}`,
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
        {
          test: /\.js$/,
          enforce: 'pre',
          // limit loader to files in the current project,
          // to skip any files linked from other projects (like Bit itself)
          include: path.join(workDir, 'node_modules'),
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: (value) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        {
          test: /\.js$/,
          // limit loader to files in the current project,
          // to skip any files linked from other projects (like Bit itself)
          include: path.join(workDir, 'node_modules'),
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: ComponentID.isValidObject },
          use: [
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                plugins: [
                  // for component highlighting in preview.
                  [require.resolve('@teambit/react.babel.bit-react-transformer')],
                ],
                // turn off all optimizations (only slow down for node_modules)
                compact: false,
                minified: false,
              },
            },
          ],
        },
        {
          test: /\.(mjs|js|jsx|tsx|ts)$/,
          // TODO: use a more specific exclude for our selfs
          exclude: [/node_modules/, /dist/],
          include: workDir,
          resolve: {
            fullySpecified: false,
          },
          loader: require.resolve('babel-loader'),
          options: {
            babelrc: false,
            configFile: false,
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app'),
            ],
            plugins: [
              require.resolve('react-refresh/babel'),
              // for component highlighting in preview.
              [
                require.resolve('@teambit/react.babel.bit-react-transformer'),
                {
                  componentFilesPath: fileMapPath,
                },
              ],
            ],
          },
        },

        // "url" loader works like "file" loader except that it embeds assets
        // smaller than specified limit in bytes as data URLs to avoid requests.
        // A missing `test` is equivalent to a match.
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
          loader: require.resolve('url-loader'),
          options: {
            limit: imageInlineSizeLimit,
            name: 'static/media/[name].[hash:8].[ext]',
          },
        },

        // MDX support (move to the mdx aspect and extend from there)
        {
          test: /\.mdx?$/,
          exclude: [/node_modules/, /dist/],
          use: [
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                presets: [require.resolve('@babel/preset-react'), require.resolve('@babel/preset-env')],
                plugins: [require.resolve('react-refresh/babel')],
              },
            },
            {
              loader: require.resolve('@teambit/mdx.modules.mdx-loader'),
            },
          ],
        },
        {
          test: stylesRegexps.sassModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
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
        {
          test: stylesRegexps.sassNoModuleRegex,
          use: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.lessModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
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
        {
          test: stylesRegexps.lessNoModuleRegex,
          use: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.cssModuleRegex,
          use: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: stylesRegexps.cssNoModulesRegex,
          use: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },
    resolve: {
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),

      // this is for resolving react from env and not from consuming project
      alias: {
        react: require.resolve('react'),
        '@teambit/mdx.ui.mdx-scope-context': require.resolve('@teambit/mdx.ui.mdx-scope-context'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        '@mdx-js/react': require.resolve('@mdx-js/react'),
        // 'react-refresh/runtime': require.resolve('react-refresh/runtime'),
      },
    },

    plugins: [
      new ReactRefreshWebpackPlugin({
        overlay: {
          sockPath: `_hmr/${envId}`,
          // TODO: check why webpackHotDevClient and react-error-overlay are not responding for runtime
          // errors
          entry: require.resolve('./react-hot-dev-client'),
          module: require.resolve('./refresh'),
        },
        include: [/\.(js|jsx|tsx|ts|mdx|md)$/],
        // TODO: use a more specific exclude for our selfs
        exclude: [/dist/, /node_modules/],
      }),
    ],
  };
}
