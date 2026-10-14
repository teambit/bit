import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import type { ComponentID } from '@teambit/component-id';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';

const COMPONENT_DEPS_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
const PACKAGE_DEPS_FIELDS = ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'] as const;

type ComponentDepsField = (typeof COMPONENT_DEPS_FIELDS)[number];
type PackageDepsField = (typeof PACKAGE_DEPS_FIELDS)[number];

/**
 * the dependency fields shared by a Version object and a ConsumerComponent.
 */
export type DependenciesSnapshot = { [field in ComponentDepsField]: Dependencies } & {
  [field in PackageDepsField]: Record<string, string>;
};

export type MergedDependencies = { [field in ComponentDepsField]: Dependency[] } & {
  [field in PackageDepsField]: Record<string, string>;
};

/**
 * 3-way merge of the resolved dependencies of a component: base (the common snap), current (the target lane) and
 * other (the merged lane/main).
 *
 * a workspace merge gets the dependencies of the merged component by re-detecting them from the merged files. a bare
 * scope has no node_modules to resolve imports against, so it merges the dependencies that each side resolved when it
 * was snapped instead. the merged files contain only imports that exist on one of the sides (a file conflict stops the
 * merge), so this covers the same dependencies the detection would find: a dependency added or removed on one side, or
 * whose version or type (runtime/dev/peer) changed on one side, is taken from that side.
 *
 * each dependency is keyed by its field and name, so moving a dependency between fields (e.g. runtime to dev) is a
 * removal from one field and an addition to the other.
 * when both sides changed the same dependency differently, "theirs" takes other, any other strategy keeps current
 * (in "manual", such a version conflict is reported by the config-merger, which stops the merge before the snap).
 */
export function mergeDependencies(
  base: DependenciesSnapshot,
  current: DependenciesSnapshot,
  other: DependenciesSnapshot,
  mergeStrategy?: MergeStrategy
): MergedDependencies {
  const result = {} as MergedDependencies;
  COMPONENT_DEPS_FIELDS.forEach((field) => {
    const toMap = (snapshot: DependenciesSnapshot) =>
      new Map(snapshot[field].get().map((dep) => [dep.id.toStringWithoutVersion(), dep]));
    const [baseDeps, currentDeps, otherDeps] = [toMap(base), toMap(current), toMap(other)];
    const ids = uniqueKeys([currentDeps, otherDeps]);
    result[field] = ids.flatMap((id) => {
      const merged = threeWayMerge(baseDeps.get(id), currentDeps.get(id), otherDeps.get(id), mergeStrategy, (a, b) =>
        a.id.isEqual(b.id)
      );
      return merged ? [cloneDependency(merged)] : [];
    });
  });
  PACKAGE_DEPS_FIELDS.forEach((field) => {
    const toMap = (snapshot: DependenciesSnapshot) => new Map(Object.entries(snapshot[field] || {}));
    const [basePkgs, currentPkgs, otherPkgs] = [toMap(base), toMap(current), toMap(other)];
    result[field] = {};
    uniqueKeys([currentPkgs, otherPkgs]).forEach((name) => {
      const merged = threeWayMerge(
        basePkgs.get(name),
        currentPkgs.get(name),
        otherPkgs.get(name),
        mergeStrategy,
        (a, b) => a === b
      );
      if (merged) result[field][name] = merged;
    });
  });
  return result;
}

/**
 * set the merged dependencies on the snapshot (normally the ConsumerComponent that is about to be snapped).
 * `getVersionOfDep` overrides the version of a component dependency. e.g. a dependency on a component of the
 * current lane is resolved to the lane's version, same as a workspace resolves it according to the .bitmap.
 */
export function applyMergedDependencies(
  target: DependenciesSnapshot,
  merged: MergedDependencies,
  getVersionOfDep: (id: ComponentID) => string | undefined
) {
  COMPONENT_DEPS_FIELDS.forEach((field) => {
    merged[field].forEach((dep) => {
      const version = getVersionOfDep(dep.id);
      if (version) dep.id = dep.id.changeVersion(version);
    });
    target[field] = new Dependencies(merged[field]);
  });
  PACKAGE_DEPS_FIELDS.forEach((field) => {
    target[field] = merged[field];
  });
}

/**
 * returns undefined when the merged result is "absent" (removed or never existed).
 */
function threeWayMerge<T>(
  base: T | undefined,
  current: T | undefined,
  other: T | undefined,
  mergeStrategy: MergeStrategy | undefined,
  isEqual: (a: T, b: T) => boolean
): T | undefined {
  const equal = (a?: T, b?: T) => (a === undefined || b === undefined ? a === b : isEqual(a, b));
  if (equal(current, other)) return current;
  if (equal(base, current)) return other; // changed (or removed) on other only
  if (equal(base, other)) return current; // changed (or removed) on current only
  return mergeStrategy === 'theirs' ? other : current;
}

function uniqueKeys(maps: Map<string, unknown>[]): string[] {
  return [...new Set(maps.flatMap((map) => [...map.keys()]))];
}

function cloneDependency(dep: Dependency): Dependency {
  const clone = Dependency.getClone(dep);
  return new Dependency(clone.id, clone.relativePaths, clone.packageName, clone.versionRange);
}
