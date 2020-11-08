import { ComponentID } from '@teambit/component';

import { SerializedDependency, DependencyLifecycleType } from '../dependency';
import { BaseDependency } from '../base-dependency';

export const TYPE = 'component';

export interface SerializedComponentDependency extends SerializedDependency {
  componentId: Record<string, any>;
  isExtension: boolean;
  packageName: string;
}

// TODO: think about where is the right place to put this
export class ComponentDependency extends BaseDependency {
  constructor(
    private _componentId: ComponentID,
    private _isExtension: boolean,
    private _packageName: string,
    id: string,
    version: string,
    lifecycle: DependencyLifecycleType
  ) {
    super(id, version, lifecycle);
    this._type = TYPE;
  }

  get componentId() {
    return this._componentId;
  }

  get isExtension() {
    return this._isExtension;
  }

  get packageName() {
    return this._packageName;
  }

  serialize<SerializedComponentDependency>(): SerializedComponentDependency {
    const serialized = (Object.assign({}, super.serialize(), {
      componentId: this.componentId._legacy.serialize(),
      isExtension: this.isExtension,
      packageName: this.packageName,
    }) as unknown) as SerializedComponentDependency;
    return serialized;
  }
}
