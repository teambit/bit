import { BaseDependency, SerializedDependency, DependencyLifecycleType } from '@teambit/dependency-resolver';

export interface SerializedPackageDependency extends SerializedDependency {}

export class PackageDependency extends BaseDependency {
  constructor(id: string, version: string, lifecycle: DependencyLifecycleType) {
    super(id, version, lifecycle);
    this._type = 'package';
  }
}
