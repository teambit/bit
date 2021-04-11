import { uniqBy, prop } from 'ramda';
import { Dependency, DependencyLifecycleType, SerializedDependency, SemverVersion, PackageName } from './dependency';
import { KEY_NAME_BY_LIFECYCLE_TYPE } from './constants';

export type LifecycleDependenciesManifest = Record<PackageName, SemverVersion>;

export interface DependenciesManifest {
  dependencies?: LifecycleDependenciesManifest;
  devDependencies?: LifecycleDependenciesManifest;
  peerDependencies?: LifecycleDependenciesManifest;
}
export class DependencyList {
  constructor(private _dependencies: Array<Dependency>) {
    this._dependencies = uniqDeps(_dependencies);
  }
  // constructor(private _dependencies: Dependency[]){}

  get dependencies(): Dependency[] {
    return this._dependencies;
  }

  /**
   * @param componentIdStr complete string include the scope and the version
   */
  findDependency(componentIdStr: string): Dependency | undefined {
    return this.dependencies.find((dep) => dep.id === componentIdStr);
  }

  forEach(predicate: (dep: Dependency, index?: number) => void): void {
    this.dependencies.forEach(predicate);
  }

  map(predicate: (dep: Dependency, index?: number) => any) {
    return this.dependencies.map(predicate);
  }

  filter(predicate: (dep: Dependency, index?: number) => boolean): DependencyList {
    const filtered = this.dependencies.filter(predicate);
    return DependencyList.fromArray(filtered);
  }

  toTypeArray<T extends Dependency>(typeName: string): T[] {
    const list: T[] = (this.dependencies.filter((dep) => dep.type === typeName) as any) as T[];
    return list;
  }

  byTypeName(typeName: string): DependencyList {
    const filtered = this.dependencies.filter((dep) => dep.type === typeName);
    return DependencyList.fromArray(filtered);
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

  toDependenciesManifest(): DependenciesManifest {
    const manifest: DependenciesManifest = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
    this.forEach((dep) => {
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[dep.lifecycle];
      const entry = dep.toManifest();
      if (entry) {
        manifest[keyName][entry.packageName] = entry.version;
      }
    });
    return manifest;
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

function uniqDeps(dependencies: Array<Dependency>): Array<Dependency> {
  const uniq = uniqBy(prop('id'), dependencies);
  return uniq;
}
