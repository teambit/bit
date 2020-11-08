import { Dependency, DependencyLifecycleType, SerializedDependency } from './dependency';

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

  static merge(lists: DependencyList[]): DependencyList {
    const res: Dependency[] = [];
    const deps = lists.reduce((acc, curr) => {
      acc = acc.concat(curr.dependencies);
      return acc;
    }, res);
    return new DependencyList(deps);
  }

  static fromArray(dependencies: Array<Dependency>) {
    return new DependencyList(dependencies);
  }
}
