import webpack, { Configuration } from 'webpack';
import { ComponentID } from '@teambit/component-id';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (mfName: string, mfExposes: Record<string, string> = {}, fileMapPath: string): Configuration {
  return {
    module: {
      rules: [
        {
          test: /\.js$/,
          include: [/node_modules/, /\/dist\//],
          exclude: /@teambit\/legacy/,
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
          test: /\.(js|mjs|jsx|ts|tsx)$/,
          exclude: [/node_modules/, /\/dist\//],
          // consider: limit loader to files only in a capsule that has bitid in package.json
          // descriptionData: { componentId: ComponentID.isValidObject },
          // // or
          // include: capsulePaths
          loader: require.resolve('babel-loader'),
          options: {
            babelrc: false,
            configFile: false,
            // customize: require.resolve('babel-preset-react-app/webpack-overrides'),
            // presets: [require.resolve('@babel/preset-react')],
            plugins: [
              [
                require.resolve('@teambit/react.babel.bit-react-transformer'),
                {
                  componentFilesPath: fileMapPath,
                },
              ],
            ],
            // This is a feature of `babel-loader` for webpack (not Babel itself).
            // It enables caching results in ./node_modules/.cache/babel-loader/
            // directory for faster rebuilds.
            cacheDirectory: true,
            // See #6846 for context on why cacheCompression is disabled
            cacheCompression: false,
            compact: true,
          },
        },
      ],
    },
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        filename: 'remote-entry.js',
        // name: 'module_federation_namespace',
        name: mfName,
        exposes: mfExposes,
        // exposes: {
        // TODO: take the dist file programmatically
        // [`./${buttonId}`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.js',
        // [`./${buttonId}_composition`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.composition.js',
        // [`./${buttonId}_docs`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.docs.js',
        // [`./${buttonId}`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.js',
        // },
      }),
    ],
  };
}
