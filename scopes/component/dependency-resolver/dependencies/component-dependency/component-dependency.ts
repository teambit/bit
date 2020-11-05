import { ComponentID } from '@teambit/component';

import { SerializedDependency, DependencyLifecycleType } from '../dependency';
import { BaseDependency } from '../base-dependency';

export interface SerializedComponentDependency extends SerializedDependency {
  componentId: Object;
}

// TODO: think about where is the right place to put this
export class ComponentDependency extends BaseDependency {
  constructor(
    private _componentId: ComponentID,
    id: string,
    version: string,
    type: string,
    lifecycle: DependencyLifecycleType
  ) {
    super(id, version, type, lifecycle);
  }

  get componentId() {
    return this._componentId;
  }

  serialize(): SerializedComponentDependency {
    const serialized: SerializedComponentDependency = Object.assign({}, super.serialize(), {
      componentId: this.componentId.toObject(),
    });
    return serialized;
  }
}
