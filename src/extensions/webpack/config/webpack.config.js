const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const html = require('./html');

module.exports = function(workspaceDir, entryFiles) {
  // Gets absolute path of file within app directory
  // entryFiles = entryFiles.concat([
  //   path.join(__dirname, './browser'),
  //   path.join(__dirname, './preview')
  // ]);

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
    entry: entryFiles.map(filePath => resolveWorkspacePath(filePath)),

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

      port: 3000,

      // Public path is root of content base
      publicPath: '/'
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js']
    },

    plugins: [
      new HtmlWebpackPlugin({
        templateContent: html('Component preview'),
        filename: 'index.html'
      })
    ]
  };
};
