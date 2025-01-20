import { pickBy, keys, filter, isEmpty, cloneDeep, get, merge } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import {
  MANUALLY_ADD_DEPENDENCY,
  MANUALLY_REMOVE_DEPENDENCY,
  OVERRIDE_COMPONENT_PREFIX,
  DEPENDENCIES_FIELDS,
} from '@teambit/legacy.constants';
import { SourceFile } from '@teambit/component.sources';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ConsumerComponent, Dependency } from '@teambit/legacy.consumer-component';

export type ConsumerOverridesOfComponent = ComponentOverridesData & {
  extensions?: Record<string, any>;
  env?: Record<string, any>;
  propagate?: boolean; // whether propagate to a more general rule,
  defaultScope?: string; // default scope to export to
};

export const overridesForbiddenFields = ['name', 'main', 'version', 'bit'];
export const overridesBitInternalFields = ['propagate', 'exclude', 'env', 'defaultScope', 'extensions'];
export const nonPackageJsonFields = [...DEPENDENCIES_FIELDS, ...overridesBitInternalFields];

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

export class ComponentOverrides {
  protected overrides: ConsumerOverridesOfComponent;
  constructor(overrides: ConsumerOverridesOfComponent | null | undefined) {
    this.overrides = overrides || {};
  }
  static componentOverridesLoadingRegistry: OverridesLoadRegistry = {};
  static registerOnComponentOverridesLoading(extId, func: (id, config, legacyFiles, envExtendsDeps) => any) {
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
    component: ConsumerComponent,
    envExtendsDeps?: Dependency[]
  ): Promise<ComponentOverrides> {
    const extensionsAddedOverrides = await runOnLoadOverridesEvent(
      this.componentOverridesLoadingRegistry,
      component.bitJson?.extensions,
      component.id,
      component.files,
      envExtendsDeps
    );
    return new ComponentOverrides(extensionsAddedOverrides);
  }

  /**
   * used when creating new components directly from the scope. (snap from scope command)
   */
  static async loadNewFromScope(
    componentId: ComponentID,
    files: SourceFile[],
    extensions: ExtensionDataList,
    envExtendsDeps: Dependency[] = []
  ): Promise<ComponentOverrides> {
    const extensionsAddedOverrides = await runOnLoadOverridesEvent(
      this.componentOverridesLoadingRegistry,
      extensions,
      componentId,
      files,
      envExtendsDeps
    );
    return new ComponentOverrides(extensionsAddedOverrides);
  }

  static loadFromScope(overridesFromModel: ComponentOverridesData | null | undefined = {}) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new ComponentOverrides(cloneDeep(overridesFromModel), {});
  }

  get componentOverridesData() {
    const isNotSystemField = (val, field) => !overridesBitInternalFields.includes(field);
    return pickBy(this.overrides, isNotSystemField);
  }

  get componentOverridesPackageJsonData() {
    const isPackageJsonField = (val, field) => !nonPackageJsonFields.includes(field);
    return pickBy(this.overrides, isPackageJsonField);
  }

  getEnvByType(envType): string | Record<string, any> | undefined {
    return get(this.overrides, ['env', envType]);
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
    return keys(filter((dep) => dep === MANUALLY_REMOVE_DEPENDENCY, this.overrides[field] || {}));
  }
  getIgnoredPackages(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return ignoredRules;
  }
  clone(): ComponentOverrides {
    return new ComponentOverrides(cloneDeep(this.overrides));
  }
}

/**
 * Merge added overrides from many extensions
 *
 * @param {any[]} configs
 * @returns A merge results of all config
 */
function mergeExtensionsOverrides(configs: DependenciesOverridesData[]): any {
  return configs.reduce((prev, curr) => {
    return merge(cloneDeep(curr), prev);
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
  extensions: ExtensionDataList = new ExtensionDataList(),
  id: ComponentID,
  files: SourceFile[],
  envExtendsDeps?: Dependency[]
): Promise<DependenciesOverridesData> {
  const extensionsAddedOverridesP = Object.keys(configsRegistry).map((extId) => {
    // TODO: only running func for relevant extensions
    const func = configsRegistry[extId];
    return func(extensions, id, files, envExtendsDeps);
  });
  const extensionsAddedOverrides = await Promise.all(extensionsAddedOverridesP);
  let extensionsConfigModificationsObject = mergeExtensionsOverrides(extensionsAddedOverrides);
  const filterFunc = (val) => !isEmpty(val);
  extensionsConfigModificationsObject = pickBy(extensionsConfigModificationsObject, filterFunc);
  return extensionsConfigModificationsObject;
}
