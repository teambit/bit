import '@teambit/ui.mdx-scope-context';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import type { WebpackConfigWithDevServer } from '@teambit/webpack';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as mdxLoader from '@teambit/modules.mdx-loader';
// Make sure the bit-react-transformer is a dependency
// TODO: remove it once we can set policy from component to component then set it via the component.json
import '@teambit/babel.bit-react-transformer';

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

type Options = { envId: string; fileMapPath: string; distPaths: string[] };

export default function ({ envId, fileMapPath, distPaths }: Options): WebpackConfigWithDevServer {
  return {
    devServer: {
      sockPath: `_hmr/${envId}`,
      stats: {
        // - for webpack-dev-server, this property needs to be in the devServer configuration object.
        // - webpack 5 will replace `stats.warningFilter` with `ignoreWarnings`.
        warningsFilter: [/Failed to parse source map/],
      },
    },
    module: {
      rules: [
        {
          // support packages with `*.mjs`, namely, 'graphql'
          test: /\.mjs$/,
          include: /node_modules/,
          type: 'javascript/auto',
        },
        {
          test: /\.js$/,
          enforce: 'pre',
          include: distPaths,
          use: [require.resolve('source-map-loader')],
        },
        {
          test: /\.(mjs|js|jsx|tsx|ts)$/,
          // TODO: use a more specific exclude for our selfs
          exclude: [/node_modules/, /dist/],
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
                require.resolve('@teambit/babel.bit-react-transformer'),
                {
                  componentFilesPath: fileMapPath,
                },
              ],
            ],
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
              loader: require.resolve('@teambit/modules.mdx-loader'),
            },
          ],
        },
        {
          test: /\.module\.s(a|c)ss$/,
          loader: [
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
          test: /\.s(a|c)ss$/,
          exclude: /\.module\.s(a|c)ss$/,
          loader: [
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
          test: /\.module\.less$/,
          loader: [
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
          test: /\.less$/,
          exclude: /\.module\.less$/,
          loader: [
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
          test: /\.module.css$/,
          loader: [
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
          test: /\.css$/,
          exclude: /\.module\.css$/,
          loader: [require.resolve('style-loader'), require.resolve('css-loader')],
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
        '@teambit/ui.mdx-scope-context': require.resolve('@teambit/ui.mdx-scope-context'),
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
