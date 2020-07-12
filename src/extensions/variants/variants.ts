import R from 'ramda';
import ConsumerOverrides from '../../consumer/config/consumer-overrides';
import { BitId } from '../../bit-id';
import { Config } from '../config';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { WorkspaceComponentConfig } from '../workspace/types'; // todo: change to "import type" once babel supports it

export type Patterns = { [pattern: string]: Record<string, any> };

export type VariantsComponentConfig = WorkspaceComponentConfig & {
  propagate: boolean;
};

const INTERNAL_FIELDS = ['propagate', 'exclude'];

export class Variants {
  componentsCache: Map<string, VariantsComponentConfig>;
  _loadedLegacy: ConsumerOverrides;

  constructor(private patterns: Patterns, private hostConfig: Config) {
    this.componentsCache = new Map<string, VariantsComponentConfig>();
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

  // legacyById(componentId: BitId): ConsumerOverridesOfComponent | undefined {
  //   const rawConfig = this.byId(componentId);
  //   let config = rawConfig || {};
  //   if (!this.hostConfig.workspaceConfig?.isLegacy) {
  //     config = transformConfigToLegacy(rawConfig);
  //   }

  //   return config;
  // }

  /**
   * Gets the config for specific component after merge all matching patterns of the component id in the variants section
   * @param componentId
   */
  byId(componentId: BitId): VariantsComponentConfig | undefined {
    if (this.componentsCache.has(componentId.toString())) {
      return this.componentsCache.get(componentId.toString());
    }

    // TODO: handle propagation and exclusion
    const config = this.legacy()?.getOverrideComponentData(componentId) || {};
    const defaultScope = config.defaultScope;
    const rawExtensions = R.omit(INTERNAL_FIELDS, config);
    const extensions = ExtensionDataList.fromConfigObject(rawExtensions);
    const result: VariantsComponentConfig = {
      propagate: config.propagate ?? true,
      componentExtensions: extensions,
      componentWorkspaceMetaData: {
        defaultScope
      }
    };
    // We cache this results since this is something with state (it has - hasChanged prop which should be consistent)
    this.componentsCache.set(componentId.toString(), result);

    // TODO: transform to new format (only once we support storing all requireld fields under extensions -
    // 'dependencies',
    // 'devDependencies',
    // 'peerDependencies',
    // 'env',
    // 'propagate',
    // 'defaultScope' // or just scope
    // 'owner'

    return result;
  }
}
