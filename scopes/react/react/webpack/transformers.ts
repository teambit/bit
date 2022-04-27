import { WebpackConfigTransformContext } from '@teambit/webpack';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import { getExposedRules } from './get-exposed-rules';

export function generateAddAliasesFromPeersTransformer(peers: string[]) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const hostRootDir = context.target?.hostRootDir || context.hostRootDir;
    let options;
    if (hostRootDir) {
      options = {
        paths: [hostRootDir, __dirname],
      };
    }
    const peerAliases = peers.reduce((acc, peerName) => {
      acc[peerName] = require.resolve(peerName, options);
      return acc;
    }, {});
    config.addAliases(peerAliases);
    return config;
  };
}

/**
 * Generate a transformer that expose all the peers as global via the expose loader
 * @param peers
 * @returns
 */
export function generateExposePeersTransformer(peers: string[]) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const hostRootDir = context.target?.hostRootDir || context.hostRootDir;
    const exposedRules = getExposedRules(peers, hostRootDir);
    config.addModuleRules(exposedRules);
    return config;
  };
}
