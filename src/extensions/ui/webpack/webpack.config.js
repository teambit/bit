const HtmlWebpackPlugin = require('html-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const path = require('path');
const html = require('./html');

module.exports = function(workspaceDir, entryFiles) {
  const resolveWorkspacePath = relativePath => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  return {
    // Environment mode
    mode: 'development',

    devtool: 'inline-source-map',

    // Entry point of app
    entry: {
      main: entryFiles
      // preview: entryFiles.map(filePath => resolveWorkspacePath(filePath))
    },

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      futureEmitAssets: true,

      chunkFilename: 'static/js/[name].chunk.js',

      // point sourcemap entries to original disk locations (format as URL on windows)
      devtoolModuleFilenameTemplate: info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),

      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      globalObject: 'this'
    },

    devServer: {
      // Serve index.html as the base
      contentBase: resolveWorkspacePath('public'),

      // Enable compression
      compress: true,

      // Enable hot reloading
      hot: true,

      host,

      // Public path is root of content base
      publicPath: '/'
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js']
    },

    module: {
      rules: [
        {
          test: /\.js$/,
          enforce: 'pre',
          exclude: /node_modules/,
          use: [require.resolve('source-map-loader')]
        },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          include: workspaceDir,
          loader: require.resolve('babel-loader'),
          options: {
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app')
            ],
            plugins: [require.resolve('react-refresh/babel')]
          }
        },
        {
          test: /\.module\.s(a|c)ss$/,
          loader: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]'
                },
                sourceMap: true
              }
            },
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true
              }
            }
          ]
        },
        {
          test: /\.s(a|c)ss$/,
          exclude: /\.module.(s(a|c)ss)$/,
          loader: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true
              }
            }
          ]
        },
        {
          test: /\.css$/,
          exclude: /\.(s(a|c)ss)$/,
          loader: [require.resolve('style-loader'), require.resolve('css-loader')]
        }
      ]
    },

    plugins: [
      new ReactRefreshWebpackPlugin(),
      // Re-generate index.html with injected script tag.
      // The injected script tag contains a src value of the
      // filename output defined above.
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: html('My component workspace'),
        chunks: ['main']
      })
      // new HtmlWebpackPlugin({
      //   templateContent: html('Component preview'),
      //   chunks: ['preview'],
      //   filename: 'preview.html'
      // })
    ]
  };
};
