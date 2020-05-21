import { intersection, all } from 'ramda';
import ConsumerOverrides, { ConsumerOverridesOfComponent } from '../../consumer/config/consumer-overrides';
import { BitId } from '../../bit-id';
import { Config } from '../config';

export type Patterns = { [pattern: string]: Record<string, any> };

export class Variants {
  componentsCache: Map<string, ConsumerOverridesOfComponent | undefined>;
  _loadedLegacy: ConsumerOverrides;

  constructor(private patterns: Patterns, private hostConfig: Config) {
    this.componentsCache = new Map<string, ConsumerOverridesOfComponent | undefined>();
    this._loadedLegacy = ConsumerOverrides.load(this.patterns);
  }

  raw(): Patterns {
    return this.patterns;
  }

  /**
   * Get all the patterns defined in the variants section of the workspace as the legacy ConsumerOverrides format
   */
  legacy(): ConsumerOverrides {
    // return ConsumerOverrides.load(this.patterns);
    return this._loadedLegacy;
  }

  legacyById(componentId: BitId): ConsumerOverridesOfComponent | undefined {
    const rawConfig = this.byId(componentId);
    let config = rawConfig || {};
    if (!this.hostConfig.workspaceConfig?.isLegacy) {
      config = transformConfigToLegacy(rawConfig);
    }
    // Add the envs from the root workspace config in case of legacy workspace config
    if (this.hostConfig.workspaceConfig) {
      const plainLegacy = this.hostConfig.workspaceConfig.toLegacy()._legacyPlainObject();
      if (plainLegacy) {
        config.env = config.env || {};
        config.env.compiler = config.env.compiler || plainLegacy.env.compiler;
        config.env.tester = config.env.tester || plainLegacy.env.tester;
      }
    }
    return config;
  }

  /**
   * Gets the config for specific component after merge all matching patterns of the component id in the variants section
   * @param componentId
   */
  byId(componentId: BitId): Record<string, any> | undefined {
    if (this.componentsCache.has(componentId.toString())) {
      return this.componentsCache.get(componentId.toString());
    }

    const config = this.legacy()?.getOverrideComponentData(componentId) || {};
    // We cache this results since this is something with state (it has - hasChanged prop which should be consistent)
    this.componentsCache.set(componentId.toString(), config);

    // TODO: transform to new format (only once we support storing all requireld fields under extensions -
    // 'dependencies',
    // 'devDependencies',
    // 'peerDependencies',
    // 'env',
    // 'propagate',
    // 'defaultScope' // or just scope
    // 'owner'

    return config;
  }
}

function transformConfigToLegacy(config: Record<string, any> | undefined): ConsumerOverridesOfComponent {
  if (!config) {
    return {};
  }
  // TODO: handle specific fields from the extensions like taking deps from the dependency-resolver
  // and scope / owner from somewhere
  const res = {
    extensions: config
  };
  return res;
}
