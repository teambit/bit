import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

export function generateAddAliasesFromPeersTransformer(peers: string[]) {
  const peerAliases = peers.reduce((acc, peerName) => {
    const keyName = `${peerName}$`;
    acc[keyName] = require.resolve(peerName);
    return acc;
  }, {});
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.addAliases(peerAliases);
    return config;
  };
}
