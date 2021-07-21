import webpack, { Configuration } from 'webpack';
import { ComponentID } from '@teambit/component-id';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (mfName: string, mfExposes: Record<string, string> = {}): Configuration {
  return {
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
