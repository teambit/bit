// @flow
import BitId from '../../bit-id/bit-id';

export type OverrideComponent = {
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object,
  envs?: Object
};

export default class ComponentsOverrides {
  overrides: { [string]: OverrideComponent };
  constructor(overrides: { [string]: OverrideComponent }) {
    this.overrides = overrides;
  }
  static load(overrides: Object = {}) {
    return new ComponentsOverrides(overrides);
  }
  getOverrideComponentData(bitId: BitId): ?OverrideComponent {
    const foundComponent = Object.keys(this.overrides).find(
      idStr => bitId.toStringWithoutVersion() === idStr || bitId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!foundComponent) return null;
    return this.overrides[foundComponent];
  }
  getAllDependenciesOverridesOfComponents(bitId: BitId): Object {
    const componentData = this.getOverrideComponentData(bitId);
    if (!componentData) return {};
    return Object.assign(
      componentData.dependencies || {},
      componentData.devDependencies || {},
      componentData.peerDependencies
    );
  }
}
