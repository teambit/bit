import type { ComponentID } from '@teambit/component-id';
import type { BitIdProps } from '@teambit/legacy-bit-id';

import { SerializedDependency, DependencyLifecycleType, DependencyManifest } from '../dependency';
import { BaseDependency } from '../base-dependency';
import { DependencySource } from '../../policy/variant-policy/variant-policy';

export const TYPE = 'component';

export interface SerializedComponentDependency extends SerializedDependency {
  componentId: BitIdProps;
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
    lifecycle: DependencyLifecycleType,
    source?: DependencySource
  ) {
    super(id, version, lifecycle, source);
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

  getPackageName() {
    return this.packageName;
  }

  setVersion(newVersion: string) {
    super.setVersion(newVersion);
    const newComponentId = this.componentId.changeVersion(newVersion);
    this._componentId = newComponentId;
    const splittedId = this.id.split('@');
    if (splittedId.length === 2) {
      const newId = `${splittedId[0]}@${newVersion}`;
      this.id = newId;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  serialize<SerializedComponentDependency>(): SerializedComponentDependency {
    const serialized = Object.assign({}, super.serialize(), {
      componentId: this.componentId._legacy.serialize(),
      isExtension: this.isExtension,
      packageName: this.packageName,
    }) as unknown as SerializedComponentDependency;
    return serialized;
  }

  toManifest(): DependencyManifest {
    const packageName = this.getPackageName?.();
    const version = this.version;
    return {
      packageName,
      version,
    };
  }
}
