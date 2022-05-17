import { WebpackConfigTransformContext } from '@teambit/webpack';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import { Logger } from '@teambit/logger';
import { getExposedRules } from './get-exposed-rules';
import { resolvePeerToDirOrFile } from './resolve-peer';

export function generateAddAliasesFromPeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const peerAliases = peers.reduce((acc, peerName) => {
      acc[peerName] = resolvePeerToDirOrFile(peerName, logger, context.target.hostRootDir);
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
export function generateExposePeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const exposedRules = getExposedRules(peers, logger, context.target.hostRootDir);
    config.addModuleRules(exposedRules);
    return config;
  };
}
