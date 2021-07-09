import {
  BaseDependency,
  SerializedDependency,
  DependencyLifecycleType,
  DependencySource,
} from '@teambit/dependency-resolver';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SerializedPackageDependency extends SerializedDependency {}

export class PackageDependency extends BaseDependency {
  constructor(id: string, version: string, lifecycle: DependencyLifecycleType, source?: DependencySource) {
    super(id, version, lifecycle, source);
    this._type = 'package';
  }

  getPackageName() {
    return this.id;
  }
}
