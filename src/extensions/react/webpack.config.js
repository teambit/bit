const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = function createWebpackConfig(workspaceDir, entryFiles) {
  // Gets absolute path of file within app directory
  const resolveWorkspacePath = relativePath => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  return {
    // Environment mode
    mode: 'development',

    // Entry point of app
    entry: entryFiles.map(filePath => resolveWorkspacePath(filePath)),

    output: {
      // Development filename output
      filename: 'static/js/bundle.js'
    },

    devServer: {
      // Serve index.html as the base
      contentBase: resolveWorkspacePath('public'),

      // Enable compression
      compress: true,

      // Enable hot reloading
      hot: true,

      host,

      port: 3000,

      // Public path is root of content base
      publicPath: '/'
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          include: resolveWorkspacePath('components'),
          loader: require.resolve('babel-loader'),
          options: {
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app')
            ]
          }
        }
      ]
    },

    plugins: [
      // Re-generate index.html with injected script tag.
      // The injected script tag contains a src value of the
      // filename output defined above.
      new HtmlWebpackPlugin({
        inject: true,
        template: '/Users/ranmizrahi/Bit/bit/src/extensions/react/assets/index.html'
      })
    ]
  };
};
