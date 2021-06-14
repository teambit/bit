import webpack, { Configuration } from 'webpack';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (
  mfName: string,
  server: string,
  port = 3000,
  remoteEntryName = 'remote-entry.js'
): Configuration {
  return {
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        // TODO: implement
        remotes: {
          [mfName]: `${mfName}@${server}:${port}/${remoteEntryName}`,
        },
      }),
    ],
  };
}
