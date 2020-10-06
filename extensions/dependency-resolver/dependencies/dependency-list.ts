import { Dependency, DependencyLifecycleType, SerializedDependency } from './dependency';
import { PackageDependency } from './package-dependency';
import { ComponentDependency } from './component-dependency';
import LegacyComponent from 'bit-bin/dist/consumer/component';

export class DependencyList {
  constructor(private _dependencies: Array<Dependency>) {}
  // constructor(private _dependencies: Dependency[]){}

  get dependencies(): Dependency[] {
    return this._dependencies;
  }

  byTypeName<T extends Dependency>(typeName: string): T[] {
    const list: T[] = (this.dependencies.filter((dep) => dep.type === typeName) as any) as T[];
    return list;
  }

  byLifecycle(lifecycle: DependencyLifecycleType): DependencyList {
    const filtered = this.dependencies.filter((dep) => dep.lifecycle === lifecycle);
    return DependencyList.fromArray(filtered);
  }

  serialize(): SerializedDependency[] {
    const serialized = this.dependencies.map((dep) => {
      return dep.serialize();
    });
    return serialized;
  }

  static fromArray(dependencies: Array<Dependency>) {
    return new DependencyList(dependencies);
  }
}
