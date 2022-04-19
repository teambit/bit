import findRoot from 'find-root';
import { WebpackConfigTransformContext } from '@teambit/webpack';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import { Logger } from '@teambit/logger';
import { getExposedRules } from './get-exposed-rules';

export function generateAddAliasesFromPeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const peerAliases = peers.reduce((acc, peerName) => {
      acc[peerName] = getResolvedDirOrFile(peerName, logger, context.target.hostRootDir);
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
    const exposedRules = getExposedRules(peers, context.target.hostRootDir);
    config.addModuleRules(exposedRules);
    return config;
  };
}

/**
 * Get the package folder, and in case it's not found get the require.resolve path
 * @param peerName
 * @returns
 */
function getResolvedDirOrFile(peerName: string, logger: Logger, hostRootDir?: string): string | undefined {
  let resolved;
  try {
    let options;
    if (hostRootDir) {
      options = {
        paths: [hostRootDir, __dirname],
      };
    }
    resolved = require.resolve(peerName, options);
    const folder = findRoot(resolved);
    return folder;
  } catch (e) {
    if (resolved) {
      logger.warn(`Couldn't find root dir for "${peerName}" from path "${resolved}" to add it as webpack alias`);
    } else {
      logger.warn(`Couldn't resolve "${peerName}" to add it as webpack alias`);
    }
    return resolved;
  }
}
