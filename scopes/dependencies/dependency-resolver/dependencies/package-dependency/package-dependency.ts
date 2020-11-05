import { BaseDependency } from '../base-dependency';
import { SerializedDependency, Dependency, DependencyLifecycleType } from '../dependency';

export interface SerializedPackageDependency extends SerializedDependency {}

export class PackageDependency extends BaseDependency implements Dependency {
  constructor(id: string, version: string, lifecycle: DependencyLifecycleType) {
    super(id, version, lifecycle);
    this._type = 'package';
  }
}
