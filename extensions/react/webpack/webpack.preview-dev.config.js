module.exports = function () {
  return {
    module: {
      rules: [
        // {
        //   test: /\.js$/,
        //   enforce: 'pre',
        //   exclude: /node_modules/,
        //   use: [require.resolve('source-map-loader')],
        // },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          loader: require.resolve('babel-loader'),
          options: {
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app'),
            ],
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
          exclude: /\.module.(s(a|c)ss)$/,
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
          test: /\.css$/,
          exclude: /\.(s(a|c)ss)$/,
          loader: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },

    plugins: [new HelloWorldPlugin({})],

    resolve: {
      // this is for resolving react from env and not from consuming project
      alias: {
        react: require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
      },
    },
  };
};

class HelloWorldPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('Hello World Plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      console.log('Hello World!');
    });
  }
}
