const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

module.exports = function() {
  return {
    module: {
      rules: [
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          loader: require.resolve('babel-loader'),
          options: {
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app')
            ],
            plugins: [require.resolve('react-refresh/babel')]
          }
        }
      ]
    },

    plugins: [new ReactRefreshWebpackPlugin()]
  };
};
