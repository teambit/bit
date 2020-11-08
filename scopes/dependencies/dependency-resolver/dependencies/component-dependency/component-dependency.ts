import { ComponentID } from '@teambit/component';

import { SerializedDependency, DependencyLifecycleType } from '../dependency';
import { BaseDependency } from '../base-dependency';

export const TYPE = 'component';

export interface SerializedComponentDependency extends SerializedDependency {
  componentId: Object;
}

// TODO: think about where is the right place to put this
export class ComponentDependency extends BaseDependency {
  constructor(private _componentId: ComponentID, id: string, version: string, lifecycle: DependencyLifecycleType) {
    super(id, version, lifecycle);
    this._type = TYPE;
  }

  get componentId() {
    return this._componentId;
  }

  serialize<SerializedComponentDependency>(): SerializedComponentDependency {
    const serialized = (Object.assign({}, super.serialize(), {
      componentId: this.componentId._legacy.serialize(),
    }) as unknown) as SerializedComponentDependency;
    return serialized;
  }
}
