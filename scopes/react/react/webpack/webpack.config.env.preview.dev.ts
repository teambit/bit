import webpack, { Configuration } from 'webpack';
import fs from 'fs-extra';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (envId: string): Configuration {
  return {
    devServer: {
      // @ts-ignore - remove this once there is types package for webpack-dev-server v4
      client: {
        path: `_hmr/${envId}`,
      },
    },
  };
}
