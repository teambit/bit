import { WebpackConfigTransformContext } from '@teambit/webpack';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import { Logger } from '@teambit/logger';
import { getExposedRules } from './get-exposed-rules';
import { resolvePeerToDirOrFile } from './resolve-peer';
import { getExternals } from './get-externals';

export function generateAddAliasesFromPeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const hostRootDir = context.target?.hostRootDir || context.hostRootDir;
    const peerAliases = peers.reduce((acc, peerName) => {
      // gets the correct module folder of the package.
      // this allows us to resolve internal files, for example:
      // node_modules/react-dom/test-utils
      //
      // we can't use require.resolve() because it resolves to a specific file.
      // for example, if we used "react-dom": require.resolve("react-dom"),
      // it would try to resolve "react-dom/test-utils" as:
      // node_modules/react-dom/index.js/test-utils
      const resolved = resolvePeerToDirOrFile(peerName, logger, hostRootDir);
      // Sometime there are packages that only hold icons for example, so there is no main property in their package.json
      // so they can't be resolved.
      // in such cases do not add them to the aliases.
      // We already log that cases in the resolvePeerToDirOrFile function.
      if (resolved) {
        acc[peerName] = resolved;
      }
      return acc;
    }, {});

    config.addAliases(peerAliases);
    return config;
  };
}

// [dead code] - no longer used
/**
 * Generate a transformer that expose all the peers as global via the expose loader
 * @param peers
 * @returns
 */
export function generateExposePeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const hostRootDir = context.target?.hostRootDir || context.hostRootDir;
    const exposedRules = getExposedRules(peers, logger, hostRootDir);
    config.addModuleRules(exposedRules);
    return config;
  };
}

/**
 * Generate a transformer that expose all the peers as global via the expose loader
 * @param peers
 * @returns
 */
export function generateExternalsTransformer(depes: string[]) {
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    const externals = getExternals(depes);
    config.addExternals(externals);
    return config;
  };
}
