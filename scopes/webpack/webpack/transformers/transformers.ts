import type { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import type { Logger } from '@teambit/logger';
import { generateAddAliasesFromPeersTransformer } from '@teambit/webpack.transformers.generate-add-aliases-from-peers';
import { generateExternalsTransformer } from '@teambit/webpack.transformers.generate-externals';
import { getExposedRules } from './get-exposed-rules';
import type { WebpackConfigTransformContext } from '../webpack.main.runtime';

/**
 * @deprecated these are thin re-exports kept for backward-compatible `from '@teambit/webpack'`
 * imports; import them directly from `@teambit/webpack.transformers.generate-add-aliases-from-peers`
 * and `@teambit/webpack.transformers.generate-externals` instead.
 */
export { generateAddAliasesFromPeersTransformer, generateExternalsTransformer };

// [dead code] - no longer used
/**
 * Generate a transformer that expose all the peers as global via the expose loader
 * @param peers
 * @returns
 * @deprecated unused internally; will be removed in a follow-up.
 */
export function generateExposePeersTransformer(peers: string[], logger: Logger) {
  return (config: WebpackConfigMutator, context: WebpackConfigTransformContext): WebpackConfigMutator => {
    const hostRootDir = context.target?.hostRootDir || context.hostRootDir;
    const exposedRules = getExposedRules(peers, logger, hostRootDir);
    config.addModuleRules(exposedRules);
    return config;
  };
}
