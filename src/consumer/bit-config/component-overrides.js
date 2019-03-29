// @flow
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import ComponentBitConfig from './component-bit-config';
import { IGNORE_DEPENDENCY } from '../../constants';
import type { ConsumerOverridesOfComponent, ConsumerOverridesConfig } from './consumer-overrides';
import { dependenciesFields } from './consumer-overrides';

export type ComponentOverridesData = {
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object
};

export default class ComponentOverrides {
  overridesFromConsumer: ConsumerOverridesConfig;
  overrides: ConsumerOverridesOfComponent;
  constructor(overrides: ?ConsumerOverridesOfComponent, overridesFromConsumer: ?ConsumerOverridesOfComponent) {
    this.overridesFromConsumer = overridesFromConsumer || {};
    this.overrides = overrides || {};
  }
  /**
   * overrides of component can be determined by three different sources.
   * 1. component-config. (bit.json/package.json of the component itself).
   *    authored don't have it, most imported have it, unless they choose not to write package.json/bit.json.
   * 2. consumer-config. (bit.json/package.json of the consumer when it has overrides of the component).
   * 3. model. (when the component is tagged, the overrides data is saved into the model).
   *
   * the strategy of loading them is simple:
   * if the component config is written to the filesystem, use it (#1). otherwise, use the config
   * from the model. once you have the config, merge it with the consumer-config.
   */
  static load(
    overridesFromConsumer: ?ConsumerOverridesOfComponent,
    overridesFromModel: ?ComponentOverridesData,
    componentBitConfig: ?ComponentBitConfig
  ): ComponentOverrides {
    const overridesFromComponent =
      componentBitConfig && componentBitConfig.componentHasWrittenConfig
        ? componentBitConfig.overrides
        : overridesFromModel;
    const overrides = this.mergeConsumerAndComponentOverrides(overridesFromComponent, overridesFromConsumer);
    return new ComponentOverrides(overrides, overridesFromConsumer);
  }
  static mergeConsumerAndComponentOverrides(
    overridesFromComponent: ?ComponentOverridesData,
    overridesFromConsumer: ?ConsumerOverridesOfComponent
  ): ?Object {
    if (RA.isNilOrEmpty(overridesFromComponent) && RA.isNilOrEmpty(overridesFromConsumer)) return null;
    // at least one overrides is defined
    if (RA.isNilOrEmpty(overridesFromConsumer)) return overridesFromComponent;
    if (RA.isNilOrEmpty(overridesFromComponent)) return overridesFromConsumer;
    // we don't propagate by default. so if overrides from component is found, just use it.
    return overridesFromComponent;
  }
  static componentOverridesDataFields() {
    return dependenciesFields;
  }
  get componentOverridesData() {
    const fields = ComponentOverrides.componentOverridesDataFields();
    const isDependencyField = (val, field) => fields.includes(field);
    return R.pickBy(isDependencyField, this.overrides);
  }
  getAllDependenciesOverrides(): Object {
    return Object.assign(
      {},
      this.overrides.dependencies,
      this.overrides.devDependencies,
      this.overrides.peerDependencies
    );
  }
  getAllDependenciesOverridesFromConsumer(): Object {
    return Object.assign(
      {},
      this.overridesFromConsumer.dependencies,
      this.overridesFromConsumer.devDependencies,
      this.overridesFromConsumer.peerDependencies
    );
  }
  getIgnoredDependencies(): string[] {
    return R.keys(R.filter(dep => dep === IGNORE_DEPENDENCY, this.overrides.dependencies || {}));
  }
  getIgnoredDevDependencies(): string[] {
    return R.keys(R.filter(dep => dep === IGNORE_DEPENDENCY, this.overrides.devDependencies || {}));
  }
  getIgnoredPeerDependencies(): string[] {
    return R.keys(R.filter(dep => dep === IGNORE_DEPENDENCY, this.overrides.peerDependencies || {}));
  }
}
