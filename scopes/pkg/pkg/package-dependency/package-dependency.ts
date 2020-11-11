import { BaseDependency, SerializedDependency, DependencyLifecycleType } from '@teambit/dependency-resolver';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SerializedPackageDependency extends SerializedDependency {}

export class PackageDependency extends BaseDependency {
  constructor(id: string, version: string, lifecycle: DependencyLifecycleType) {
    super(id, version, lifecycle);
    this._type = 'package';
  }

  getPackageName() {
    return this.id;
  }
}
