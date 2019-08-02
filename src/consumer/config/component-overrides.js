// @flow
import R from 'ramda';
import ComponentConfig from './component-config';
import {
  MANUALLY_REMOVE_DEPENDENCY,
  MANUALLY_ADD_DEPENDENCY,
  OVERRIDE_FILE_PREFIX,
  OVERRIDE_COMPONENT_PREFIX
} from '../../constants';
import type { ConsumerOverridesOfComponent } from './consumer-overrides';
import { dependenciesFields, overridesSystemFields, nonPackageJsonFields } from './consumer-overrides';

export type ComponentOverridesData = {
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object
};

export default class ComponentOverrides {
  overrides: ConsumerOverridesOfComponent;
  overridesFromConsumer: ConsumerOverridesOfComponent;
  constructor(overrides: ?ConsumerOverridesOfComponent, overridesFromConsumer: ?ConsumerOverridesOfComponent) {
    this.overrides = overrides || {};
    this.overridesFromConsumer = overridesFromConsumer || {};
  }
  /**
   * overrides of component can be determined by three different sources.
   * 1. component-config. (bit.json/package.json of the component itself).
   *    authored normally don't have it, most imported have it, unless they choose not to write package.json/bit.json.
   * 2. consumer-config. (bit.json/package.json of the consumer when it has overrides of the component).
   * 3. model. (when the component is tagged, the overrides data is saved into the model).
   *
   * the strategy of loading them is simple:
   * if the component config is written to the filesystem, use it (#1).
   * if the component config is not written, it can be for two reasons:
   * a) it's imported and the user chose not to write package.json nor bit.json. in this case, use
   * component from the model.
   * b) it's author. by default, the config is written into consumer-config (if not exist) on import.
   * which, in this case, use only consumer-config.
   * an exception is when an author runs `eject-conf` command to explicitly write the config, then,
   * use the component-config.
   */
  static loadFromConsumer(
    overridesFromConsumer: ?ConsumerOverridesOfComponent,
    overridesFromModel: ?ComponentOverridesData,
    componentConfig: ?ComponentConfig,
    isAuthor: boolean
  ): ComponentOverrides {
    if (componentConfig && componentConfig.componentHasWrittenConfig) {
      // $FlowFixMe
      return new ComponentOverrides(componentConfig.overrides, overridesFromConsumer);
    }
    if (!isAuthor) {
      return ComponentOverrides.loadFromScope(overridesFromModel);
    }
    return new ComponentOverrides(overridesFromConsumer, overridesFromConsumer);
  }
  static loadFromScope(overridesFromModel: ?ComponentOverridesData = {}) {
    // $FlowFixMe
    return new ComponentOverrides(R.clone(overridesFromModel), {});
  }
  get componentOverridesData() {
    const isNotSystemField = (val, field) => !overridesSystemFields.includes(field);
    return R.pickBy(isNotSystemField, this.overrides);
  }
  get componentOverridesPackageJsonData() {
    const isPackageJsonField = (val, field) => !nonPackageJsonFields.includes(field);
    return R.pickBy(isPackageJsonField, this.overrides);
  }
  getComponentDependenciesWithVersion(): Object {
    const allDeps = Object.assign(
      {},
      this.overrides.dependencies,
      this.overrides.devDependencies,
      this.overrides.peerDependencies
    );
    return this._filterForComponentWithValidVersion(allDeps);
  }
  getComponentDependenciesWithVersionFromConsumer(): Object {
    const allDeps = Object.assign(
      {},
      this.overridesFromConsumer.dependencies,
      this.overridesFromConsumer.devDependencies,
      this.overridesFromConsumer.peerDependencies
    );
    return this._filterForComponentWithValidVersion(allDeps);
  }
  _filterForComponentWithValidVersion(deps: Object): Object {
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
  stripOriginallySharedDir(sharedDir: ?string) {
    if (!sharedDir) return;
    dependenciesFields.forEach((field) => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach((rule) => {
        if (!rule.startsWith(OVERRIDE_FILE_PREFIX)) return;
        const fileWithSharedDir = rule.replace(OVERRIDE_FILE_PREFIX, '');
        // $FlowFixMe we made sure that sharedDir is not empty
        const fileWithoutSharedDir = fileWithSharedDir.replace(`${sharedDir}/`, '');
        // $FlowFixMe
        const value = this.overrides[field][rule];
        // $FlowFixMe
        delete this.overrides[field][rule];
        // $FlowFixMe
        this.overrides[field][`${OVERRIDE_FILE_PREFIX}${fileWithoutSharedDir}`] = value;
      });
    });
  }
  addOriginallySharedDir(sharedDir: ?string) {
    if (!sharedDir) return;
    dependenciesFields.forEach((field) => {
      if (!this.overrides[field]) return;
      Object.keys(this.overrides[field]).forEach((rule) => {
        if (!rule.startsWith(OVERRIDE_FILE_PREFIX)) return;
        const fileWithoutSharedDir = rule.replace(OVERRIDE_FILE_PREFIX, '');
        // $FlowFixMe
        const fileWithSharedDir = `${sharedDir}/${fileWithoutSharedDir}`;
        // $FlowFixMe
        const value = this.overrides[field][rule];
        // $FlowFixMe
        delete this.overrides[field][rule];
        // $FlowFixMe
        this.overrides[field][`${OVERRIDE_FILE_PREFIX}${fileWithSharedDir}`] = value;
      });
    });
  }
  static getAllFilesPaths(overrides: Object): string[] {
    if (!overrides) return [];
    const allDeps = Object.assign({}, overrides.dependencies, overrides.devDependencies, overrides.peerDependencies);
    return Object.keys(allDeps)
      .filter(rule => rule.startsWith(OVERRIDE_FILE_PREFIX))
      .map(rule => rule.replace(OVERRIDE_FILE_PREFIX, ''));
  }
  clone(): ComponentOverrides {
    return new ComponentOverrides(R.clone(this.overrides), R.clone(this.overridesFromConsumer));
  }
}
