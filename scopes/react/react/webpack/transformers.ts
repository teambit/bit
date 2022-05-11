import findRoot from 'find-root';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

export function generateAddAliasesFromPeersTransformer(peers: string[]) {
  const peerAliases = peers.reduce((acc, peerName) => {
    const keyName = `${peerName}`;
    // Get the dir of the package, to support cases like import react-dom/test-utils
    // in case we just do require.resolve('react=dom') here it wil be resolved to something like
    // node_modules/react-dom/index.js/test-utils which won't work
    // once resolve to the folder it will resolve correctly
    acc[keyName] = getResolvedDirOrFile(peerName);
    return acc;
  }, {});
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.addAliases(peerAliases);
    return config;
  };
}

/**
 * Get the package folder, and in case it's not found get the require.resolve path
 * @param peerName
 * @returns
 */
function getResolvedDirOrFile(peerName: string): string {
  const resolved = require.resolve(peerName);
  try {
    const folder = findRoot(resolved);
    return folder;
  } catch (e) {
    return resolved;
  }
}
