import R from 'ramda';

import { BitId } from '../../bit-id';
import {
  COMPONENT_ORIGINS,
  DEPENDENCIES_FIELDS,
  MANUALLY_ADD_DEPENDENCY,
  MANUALLY_REMOVE_DEPENDENCY,
  OVERRIDE_COMPONENT_PREFIX,
  OVERRIDE_FILE_PREFIX,
} from '../../constants';
import { filterObject } from '../../utils';
import { ComponentOrigin } from '../bit-map/component-map';
import ComponentConfig from './component-config';
import {
  ConsumerOverridesOfComponent,
  nonPackageJsonFields,
  overridesBitInternalFields,
  overridesForbiddenFields,
} from './consumer-overrides';
import { ExtensionDataList } from './extension-data';
import { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';

// consumer internal fields should not be used in component overrides, otherwise, they might conflict upon import
export const componentOverridesForbiddenFields = [...overridesForbiddenFields, ...overridesBitInternalFields];

export type DependenciesOverridesData = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type ComponentOverridesData = DependenciesOverridesData & {
  [key: string]: any; // any package.json field should be valid here. can't be overridesSystemFields
};

type OverridesLoadRegistry = { [extId: string]: Function };

export default class ComponentOverrides {
  overrides: ConsumerOverridesOfComponent;
  constructor(overrides: ConsumerOverridesOfComponent | null | undefined) {
    this.overrides = overrides || {};
  }
  static componentOverridesLoadingRegistry: OverridesLoadRegistry = {};
  static registerOnComponentOverridesLoading(extId, func: (id, config) => any) {
    this.componentOverridesLoadingRegistry[extId] = func;
  }

  /**
   * overrides of component can be determined by three different sources.
   * 1. component-config. (bit.json/package.json of the component itself).
   *    authored normally don't have it, most imported have it, unless they choose not to write package.json/bit.json.
   * 2. consumer-config. (bit.json/package.json of the consumer when it has overrides of the component).
   * 3. model. (when the component is tagged, the overrides data is saved into the model).
   *
   * the strategy of loading them is as follows:
   * a) find the component config. (if exists)
   * b) find the overrides of workspace config matching this component. (if exists)
   * c) merge between the two. in case of conflict, the component config wins.
   *
   * the following steps are needed to find the component config
   * a) if the component config is written to the filesystem, use it
   * b) if the component config is not written, it can be for two reasons:
   * 1) it's imported and the user chose not to write package.json nor bit.json. in this case, use
   * component from the model.
   * 2) it's author. by default, the config is written into consumer-config (if not exist) on import.
   * which, in this case, use only consumer-config.
   * an exception is when an author runs `eject-conf` command to explicitly write the config, then,
   * use the component-config.
   */
  static async loadFromConsumer(
    componentId: BitId,
    workspaceConfig: ILegacyWorkspaceConfig,
    overridesFromModel: ComponentOverridesData | undefined,
    componentConfig: ComponentConfig,
    origin: ComponentOrigin,
    isLegacy: boolean
  ): Promise<ComponentOverrides> {
    const isAuthor = origin === COMPONENT_ORIGINS.AUTHORED;
    const isNotNested = origin !== COMPONENT_ORIGINS.NESTED;
    // overrides from consumer-config is not relevant and should not affect imported
    let legacyOverridesFromConsumer = isNotNested ? workspaceConfig?.getComponentConfig(componentId) : null;

    if (isAuthor) {
      const plainLegacy = workspaceConfig?._legacyPlainObject();
      if (plainLegacy && plainLegacy.env) {
        legacyOverridesFromConsumer = legacyOverridesFromConsumer || {};
        legacyOverridesFromConsumer.env = {};
        legacyOverridesFromConsumer.env.compiler = plainLegacy.env.compiler;
        legacyOverridesFromConsumer.env.tester = plainLegacy.env.tester;
      }
    }

    const getFromComponent = (): ComponentOverridesData | null | undefined => {
      if (componentConfig && componentConfig.componentHasWrittenConfig) {
        return componentConfig.overrides;
      }
      return isAuthor ? null : overridesFromModel;
    };
    let extensionsAddedOverrides = {};
    // Do not run the hook for legacy projects since it will use the default env in that case for takeing dependencies and will change the main file
    if (!isLegacy) {
      extensionsAddedOverrides = await runOnLoadOverridesEvent(
        this.componentOverridesLoadingRegistry,
        componentConfig.parseExtensions()
      );
    }
    const mergedLegacyConsumerOverridesWithExtensions = mergeOverrides(
      legacyOverridesFromConsumer || {},
      extensionsAddedOverrides
    );
    const fromComponent = getFromComponent();
    if (!fromComponent) {
      return new ComponentOverrides(mergedLegacyConsumerOverridesWithExtensions);
    }

    const mergedOverrides = mergedLegacyConsumerOverridesWithExtensions
      ? mergeOverrides(fromComponent, mergedLegacyConsumerOverridesWithExtensions)
      : fromComponent;
    return new ComponentOverrides(mergedOverrides);
  }

  static loadFromScope(overridesFromModel: ComponentOverridesData | null | undefined = {}) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new ComponentOverrides(R.clone(overridesFromModel), {});
  }

  get componentOverridesData() {
    const isNotSystemField = (val, field) => !overridesBitInternalFields.includes(field);
    return R.pickBy(isNotSystemField, this.overrides);
  }

  get componentOverridesPackageJsonData() {
    const isPackageJsonField = (val, field) => !nonPackageJsonFields.includes(field);
    return R.pickBy(isPackageJsonField, this.overrides);
  }

  getEnvByType(envType): string | Record<string, any> | undefined {
    return R.path(['env', envType], this.overrides);
  }

  getComponentDependenciesWithVersion(): Record<string, any> {
    const allDeps = Object.assign(
      {},
      this.overrides.dependencies,
      this.overrides.devDependencies,
      this.overrides.peerDependencies
    );
    return this._filterForComponentWithValidVersion(allDeps);
  }
  get defaultScope() {
    return this.overrides.defaultScope;
  }

  _filterForComponentWithValidVersion(deps: Record<string, any>): Record<string, any> {
    return Object.keys(deps).reduce((acc, current) => {
      if (this._isValidVersion(deps[current]) && current.startsWith(OVERRIDE_COMPONENT_PREFIX)) {
        const component = current.replace(OVERRIDE_COMPONENT_PREFIX, '');
        acc[component] = deps[current];
      }
      return acc;
    }, {});
  }
  _isValidVersion(ver: string) {
    return ver !== MANUALLY_ADD_DEPENDENCY && ver !== MANUALLY_REMOVE_DEPENDENCY;
  }
  getIgnored(field: string): string[] {
    return R.keys(R.filter((dep) => dep === MANUALLY_REMOVE_DEPENDENCY, this.overrides[field] || {}));
  }
  getIgnoredFiles(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return ignoredRules
      .filter((rule) => rule.startsWith(OVERRIDE_FILE_PREFIX))
      .map((rule) => rule.replace(OVERRIDE_FILE_PREFIX, ''));
  }

  getIgnoredPackages(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return ignoredRules.filter((rule) => !rule.startsWith(OVERRIDE_FILE_PREFIX));
  }

  stripOriginallySharedDir(sharedDir: string | null | undefined) {
    if (!sharedDir) return;
    DEPENDENCIES_FIELDS.forEach((field) => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach((rule) => {
        if (!rule.startsWith(OVERRIDE_FILE_PREFIX)) return;
        const fileWithSharedDir = rule.replace(OVERRIDE_FILE_PREFIX, '');
        const fileWithoutSharedDir = fileWithSharedDir.replace(`${sharedDir}/`, '');
        const value = this.overrides[field][rule];
        delete this.overrides[field][rule];
        this.overrides[field][`${OVERRIDE_FILE_PREFIX}${fileWithoutSharedDir}`] = value;
      });
    });
  }
  addOriginallySharedDir(sharedDir: string | null | undefined) {
    if (!sharedDir) return;
    DEPENDENCIES_FIELDS.forEach((field) => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach((rule) => {
        if (!rule.startsWith(OVERRIDE_FILE_PREFIX)) return;
        const fileWithoutSharedDir = rule.replace(OVERRIDE_FILE_PREFIX, '');
        const fileWithSharedDir = `${sharedDir}/${fileWithoutSharedDir}`;
        const value = this.overrides[field][rule];
        delete this.overrides[field][rule];
        this.overrides[field][`${OVERRIDE_FILE_PREFIX}${fileWithSharedDir}`] = value;
      });
    });
  }
  static getAllFilesPaths(overrides: Record<string, any>): string[] {
    if (!overrides) return [];
    const allDeps = Object.assign({}, overrides.dependencies, overrides.devDependencies, overrides.peerDependencies);
    return Object.keys(allDeps)
      .filter((rule) => rule.startsWith(OVERRIDE_FILE_PREFIX))
      .map((rule) => rule.replace(OVERRIDE_FILE_PREFIX, ''));
  }
  clone(): ComponentOverrides {
    return new ComponentOverrides(R.clone(this.overrides));
  }
}

function mergeOverrides(
  overrides1: ComponentOverridesData,
  overrides2: ComponentOverridesData
): ComponentOverridesData {
  // Make sure to not mutate the original object
  const result = R.clone(overrides1);
  const isObjectAndNotArray = (val) => typeof val === 'object' && !Array.isArray(val);
  Object.keys(overrides2 || {}).forEach((field) => {
    // Do not merge internal fields
    if (overridesBitInternalFields.includes(field)) {
      return; // do nothing
    }
    if (isObjectAndNotArray(overrides1[field]) && isObjectAndNotArray(overrides2[field])) {
      result[field] = Object.assign({}, overrides2[field], overrides1[field]);
    } else if (!result[field]) {
      result[field] = overrides2[field];
    }
    // when overrides1[field] is set and not an object, do not override it by overrides2
  });
  return result;
}

/**
 * Merge added overrides from many extensions
 *
 * @param {any[]} configs
 * @returns A merge results of all config
 */
function mergeExtensionsOverrides(configs: DependenciesOverridesData[]): any {
  return configs.reduce((prev, curr) => {
    return R.mergeDeepLeft(prev, curr);
  }, {});
}

/**
 * Runs all the functions from the registry and merged their results
 *
 * @param {OverridesLoadRegistry} configsRegistry
 * @returns {Promise<ComponentOverridesData>} A merge results of the added overrides by all the extensions
 */
async function runOnLoadOverridesEvent(
  configsRegistry: OverridesLoadRegistry,
  extensions: ExtensionDataList
): Promise<DependenciesOverridesData> {
  const extensionsAddedOverridesP = Object.keys(configsRegistry).map((extId) => {
    // TODO: only running func for relevant extensions
    const func = configsRegistry[extId];
    return func(extensions);
  });
  const extensionsAddedOverrides = await Promise.all(extensionsAddedOverridesP);
  let extensionsConfigModificationsObject = mergeExtensionsOverrides(extensionsAddedOverrides);
  const filterFunc = (val) => !R.isEmpty(val);
  extensionsConfigModificationsObject = filterObject(extensionsConfigModificationsObject, filterFunc);
  return extensionsConfigModificationsObject;
}
