import webpack, { Configuration } from 'webpack';
import fs from 'fs-extra';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (): Configuration {
  return {
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        // TODO: implement
        remotes: {},
      }),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      new WorkboxWebpackPlugin.GenerateSW({
        clientsClaim: true,
        exclude: [/\.map$/, /asset-manifest\.json$/],
        // importWorkboxFrom: 'cdn',
        navigateFallback: 'public/index.html',
        navigateFallbackDenylist: [
          // Exclude URLs starting with /_, as they're likely an API call
          new RegExp('^/_'),
          // Exclude any URLs whose last part seems to be a file extension
          // as they're likely a resource and not a SPA route.
          // URLs containing a "?" character won't be blacklisted as they're likely
          // a route with query params (e.g. auth callbacks).
          new RegExp('/[^/?]+\\.[^/]+$'),
        ],
      }),
    ],
  };
}
