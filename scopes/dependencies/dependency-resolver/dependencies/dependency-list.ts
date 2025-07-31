import { uniqBy, property } from 'lodash';
import { SNAP_VERSION_PREFIX, snapToSemver } from '@teambit/component-package-version';
import type {
  Dependency,
  DependencyLifecycleType,
  SerializedDependency,
  SemverVersion,
  PackageName,
} from './dependency';
import { KEY_NAME_BY_LIFECYCLE_TYPE } from './constants';
import { ComponentDependency } from './component-dependency';

export type LifecycleDependenciesManifest = Record<PackageName, SemverVersion>;

export interface DependenciesManifest {
  dependencies?: LifecycleDependenciesManifest;
  optionalDependencies?: LifecycleDependenciesManifest;
  devDependencies?: LifecycleDependenciesManifest;
  peerDependencies?: LifecycleDependenciesManifest;
  peerDependenciesMeta?: PeerDependenciesMeta;
}

export interface PeerDependenciesMeta {
  [peerName: string]: PeerDependencyMeta;
}

export interface PeerDependencyMeta {
  optional: true;
}

export type FindDependencyOptions = {
  ignoreVersion?: boolean;
};
export class DependencyList {
  constructor(private _dependencies: Array<Dependency>) {
    this._dependencies = uniqDeps(_dependencies);
  }
  // constructor(private _dependencies: Dependency[]){}

  get dependencies(): Dependency[] {
    return this._dependencies;
  }

  sort(): DependencyList {
    const sorted = this.dependencies.sort((a, b) => {
      if (a.id < b.id) {
        return -1;
      }
      if (a.id > b.id) {
        return 1;
      }
      return 0;
    });
    return new DependencyList(sorted);
  }

  /**
   * @param componentIdStr complete string include the scope and the version
   */
  findDependency(componentIdStr: string, opts: FindDependencyOptions = {}): Dependency | undefined {
    const ignoreVersion = opts.ignoreVersion;
    if (!ignoreVersion) {
      return this.dependencies.find((dep) => dep.id === componentIdStr);
    }
    const componentIdStrWithoutVersion = removeVersion(componentIdStr);
    return this.dependencies.find((dep) => removeVersion(dep.id) === componentIdStrWithoutVersion);
  }

  findByPkgNameOrCompId(
    id: string,
    version?: string,
    lifecycle: DependencyLifecycleType = 'runtime'
  ): Dependency | undefined {
    const findByVariousStrategies = () => {
      // try by full-id or package-name
      const found = this.dependencies.filter(
        (dep) => dep.id === id || dep.getPackageName?.() === id || dep.id.startsWith(`${id}@`)
      );
      if (found.length) {
        if (found.length === 1) return found[0];
        const foundByLifecycle = found.find((dep) => dep.lifecycle === lifecycle);
        if (foundByLifecycle) return foundByLifecycle;
        return found[0];
      }
      const compDeps = this.toTypeArray<ComponentDependency>('component');

      // try by component-name
      const foundByName = compDeps.filter((dep) => dep.componentId.fullName === id);
      if (foundByName.length > 1) {
        throw new Error(
          `found multiple dependencies with the same component-name "${id}", please specify the full component-id`
        );
      }
      if (foundByName.length === 1) return foundByName[0];
      return undefined;
    };
    const found = findByVariousStrategies();
    if (!found) return undefined;
    if (version) {
      // because the version for snaps is stored in deps as the hash without the prefix of "0.0.0-""
      if (version.startsWith(SNAP_VERSION_PREFIX) && found.version === version.replace(SNAP_VERSION_PREFIX, ''))
        return found;
      return found.version === version ? found : undefined;
    }
    return found;
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

  filterHidden(): DependencyList {
    return this.filter((dep) => !dep.hidden);
  }

  toTypeArray<T extends Dependency>(typeName: string): T[] {
    const list: T[] = this.dependencies.filter((dep) => dep.type === typeName) as any as T[];
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

  getComponentDependencies(): ComponentDependency[] {
    return this.dependencies.filter((dep) => dep instanceof ComponentDependency) as ComponentDependency[];
  }

  toDependenciesManifest(): Required<DependenciesManifest> {
    const manifest: Required<DependenciesManifest> = {
      dependencies: {},
      optionalDependencies: {},
      devDependencies: {},
      peerDependencies: {},
      peerDependenciesMeta: {},
    };
    this.forEach((dep) => {
      const keyName =
        dep.optional && dep.lifecycle === 'runtime'
          ? 'optionalDependencies'
          : KEY_NAME_BY_LIFECYCLE_TYPE[dep.lifecycle];
      const entry = dep.toManifest();
      if (entry) {
        manifest[keyName][entry.packageName] = snapToSemver(entry.version);
        if (dep.optional && dep.lifecycle === 'peer') {
          manifest.peerDependenciesMeta[entry.packageName] = { optional: true };
        }
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
  const uniq = uniqBy(dependencies, property('id'));
  return uniq;
}

function removeVersion(id: string): string {
  if (id.startsWith('@')) return id.split('@')[1]; // scoped package
  return id.split('@')[0];
}
