import ConsumerOverrides, { ConsumerOverridesOfComponent } from '../../consumer/config/consumer-overrides';
import { BitId } from '../../bit-id';

export type Patterns = { [pattern: string]: Record<string, any> };

export class Variants {
  constructor(private patterns) {}

  /**
   * Get all the patterns defined in the variants section of the workspace
   */
  all(): ConsumerOverrides {
    return ConsumerOverrides.load(this.patterns);
  }

  /**
   * Gets the config for specific component after merge all matching patterns of the component id in the variants section
   * @param componentId
   */
  getComponentConfig(componentId: BitId): ConsumerOverridesOfComponent {
    const patterns = this.patterns;
    const config = patterns?.getOverrideComponentData(componentId) || {};
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
