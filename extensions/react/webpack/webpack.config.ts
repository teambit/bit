import { Configuration } from 'webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';

export default function (workspaceDir: string): Configuration {
  return {
    devServer: {
      sockPath: '_hmr/@teambit/react',
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          enforce: 'pre',
          exclude: /node_modules/,
          use: [require.resolve('source-map-loader')],
        },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          include: workspaceDir,
          loader: require.resolve('babel-loader'),
          options: {
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app'),
            ],
            plugins: [require.resolve('react-refresh/babel')],
          },
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
      // this is for resolving react from env and not from consuming project
      alias: {
        react: require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
        'react-refresh/runtime': require.resolve('react-refresh/runtime'),
      },
    },

    plugins: [
      new ReactRefreshWebpackPlugin({
        overlay: true,
      }),
    ],
  };
}
