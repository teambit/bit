import R from 'ramda';
import ComponentConfig from './component-config';
import {
  MANUALLY_REMOVE_DEPENDENCY,
  MANUALLY_ADD_DEPENDENCY,
  OVERRIDE_FILE_PREFIX,
  OVERRIDE_COMPONENT_PREFIX,
  DEPENDENCIES_FIELDS
} from '../../constants';
import { ConsumerOverridesOfComponent } from './consumer-overrides';
import { overridesBitInternalFields, nonPackageJsonFields, overridesForbiddenFields } from './consumer-overrides';

// consumer internal fields should not be used in component overrides, otherwise, they might conflict upon import
export const componentOverridesForbiddenFields = [...overridesForbiddenFields, ...overridesBitInternalFields];

export type ComponentOverridesData = {
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  peerDependencies?: Record<string, any>;
  [key: string]: any; // any package.json field should be valid here. can't be overridesSystemFields
};

export default class ComponentOverrides {
  overrides: ConsumerOverridesOfComponent;
  constructor(overrides: ConsumerOverridesOfComponent | null | undefined) {
    this.overrides = overrides || {};
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
  static loadFromConsumer(
    overridesFromConsumer: ConsumerOverridesOfComponent | null | undefined,
    overridesFromModel: ComponentOverridesData | null | undefined,
    componentConfig: ComponentConfig | null | undefined,
    isAuthor: boolean
  ): ComponentOverrides {
    const getFromComponent = (): ComponentOverridesData | null | undefined => {
      if (componentConfig && componentConfig.componentHasWrittenConfig) {
        return componentConfig.overrides;
      }
      return isAuthor ? null : overridesFromModel;
    };
    const fromComponent = getFromComponent();
    if (!fromComponent) {
      return new ComponentOverrides(overridesFromConsumer);
    }
    const overridesFromComponent = R.clone(fromComponent);
    const isObjectAndNotArray = val => typeof val === 'object' && !Array.isArray(val);
    Object.keys(overridesFromConsumer || {}).forEach(field => {
      if (overridesBitInternalFields.includes(field)) {
        return; // do nothing
      }
      if (
        isObjectAndNotArray(overridesFromComponent[field]) && // $FlowFixMe
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        isObjectAndNotArray(overridesFromConsumer[field])
      ) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        overridesFromComponent[field] = Object.assign(overridesFromConsumer[field], overridesFromComponent[field]);
      } else if (!overridesFromComponent[field]) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        overridesFromComponent[field] = overridesFromConsumer[field];
      }
      // when overridesFromComponent[field] is set and not an object, do not override it by overridesFromConsumer
    });
    return new ComponentOverrides(overridesFromComponent);
  }

  static loadFromScope(overridesFromModel: ComponentOverridesData | null | undefined = {}) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new ComponentOverrides(R.clone(overridesFromModel), {});
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get componentOverridesData() {
    const isNotSystemField = (val, field) => !overridesBitInternalFields.includes(field);
    return R.pickBy(isNotSystemField, this.overrides);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get componentOverridesPackageJsonData() {
    const isPackageJsonField = (val, field) => !nonPackageJsonFields.includes(field);
    return R.pickBy(isPackageJsonField, this.overrides);
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
    return R.keys(R.filter(dep => dep === MANUALLY_REMOVE_DEPENDENCY, this.overrides[field] || {}));
  }
  getIgnoredFiles(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return ignoredRules
      .filter(rule => rule.startsWith(OVERRIDE_FILE_PREFIX))
      .map(rule => rule.replace(OVERRIDE_FILE_PREFIX, ''));
  }
  getIgnoredComponents(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return R.flatten(
      ignoredRules
        .filter(rule => rule.startsWith(OVERRIDE_COMPONENT_PREFIX))
        .map(rule => rule.replace(OVERRIDE_COMPONENT_PREFIX, ''))
        .map(idStr => [idStr, ...this._getComponentNamesFromPackages(idStr)])
    );
  }

  /**
   * it is possible that a user added the component into the overrides as a package.
   * e.g. `@bit/david.utils.is-string` instead of `@bit/david.utils/is-string`
   * or, if not using bit.dev, `@bit/utils.is-string` instead of `@bit/utils/is-string`
   */
  _getComponentNamesFromPackages(idStr: string): string[] {
    const idSplitByDot = idStr.split('.');
    const numberOfDots = idSplitByDot.length - 1;
    if (numberOfDots === 0) return []; // nothing to do. it wasn't entered as a package
    const localScopeComponent = idSplitByDot.join('/'); // convert all dots to slashes
    if (numberOfDots === 1) {
      // it can't be from bit.dev, it must be locally
      return [localScopeComponent];
    }
    // there are two dots or more. it can be from bit.dev and it can be locally
    // for a remoteScopeComponent, leave the first dot and convert only the rest to a slash
    const remoteScopeComponent = `${R.head(idSplitByDot)}.${R.tail(idSplitByDot).join('/')}`;
    return [localScopeComponent, remoteScopeComponent];
  }
  getIgnoredPackages(field: string): string[] {
    const ignoredRules = this.getIgnored(field);
    return ignoredRules.filter(
      rule => !rule.startsWith(OVERRIDE_FILE_PREFIX) && !rule.startsWith(OVERRIDE_COMPONENT_PREFIX)
    );
  }
  stripOriginallySharedDir(sharedDir: string | null | undefined) {
    if (!sharedDir) return;
    DEPENDENCIES_FIELDS.forEach(field => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach(rule => {
        if (!rule.startsWith(OVERRIDE_FILE_PREFIX)) return;
        const fileWithSharedDir = rule.replace(OVERRIDE_FILE_PREFIX, '');
        // $FlowFixMe we made sure that sharedDir is not empty
        const fileWithoutSharedDir = fileWithSharedDir.replace(`${sharedDir}/`, '');
        const value = this.overrides[field][rule];
        delete this.overrides[field][rule];
        this.overrides[field][`${OVERRIDE_FILE_PREFIX}${fileWithoutSharedDir}`] = value;
      });
    });
  }
  addOriginallySharedDir(sharedDir: string | null | undefined) {
    if (!sharedDir) return;
    DEPENDENCIES_FIELDS.forEach(field => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach(rule => {
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const allDeps = Object.assign({}, overrides.dependencies, overrides.devDependencies, overrides.peerDependencies);
    return Object.keys(allDeps)
      .filter(rule => rule.startsWith(OVERRIDE_FILE_PREFIX))
      .map(rule => rule.replace(OVERRIDE_FILE_PREFIX, ''));
  }
  clone(): ComponentOverrides {
    return new ComponentOverrides(R.clone(this.overrides));
  }
}
