import ConsumerOverrides, { ConsumerOverridesOfComponent } from '../../consumer/config/consumer-overrides';
import { BitId } from '../../bit-id';

export type Patterns = { [pattern: string]: Record<string, any> };

export class Variants {
  componentsCache: Map<string, ConsumerOverridesOfComponent | undefined>;
  _loadedPatterns: ConsumerOverrides;

  constructor(private patterns: Patterns) {
    this.componentsCache = new Map<string, ConsumerOverridesOfComponent | undefined>();
    this._loadedPatterns = ConsumerOverrides.load(this.patterns);
  }

  raw(): Patterns {
    return this.patterns;
  }

  /**
   * Get all the patterns defined in the variants section of the workspace
   */
  all(): ConsumerOverrides {
    // return ConsumerOverrides.load(this.patterns);
    return this._loadedPatterns;
  }

  /**
   * Gets the config for specific component after merge all matching patterns of the component id in the variants section
   * @param componentId
   */
  getComponentConfig(componentId: BitId): ConsumerOverridesOfComponent | undefined {
    if (this.componentsCache.has(componentId.toString())) {
      return this.componentsCache.get(componentId.toString());
    }

    const config = this.all()?.getOverrideComponentData(componentId) || {};
    // We cache this results since this is something with state (it has - hasChanged prop which should be consistent)
    this.componentsCache.set(componentId.toString(), config);
    // const plainLegacy = this._legacyPlainObject();
    // Update envs from the root workspace object in case of legacy workspace config
    // if (plainLegacy) {
    //   config.env = config.env || {};
    //   config.env.compiler = config.env.compiler || plainLegacy.env.compiler;
    //   config.env.tester = config.env.tester || plainLegacy.env.tester;
    // }
    return config;
  }
}
