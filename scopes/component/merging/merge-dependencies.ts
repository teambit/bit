import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { isEqual, union } from 'lodash';
import type { ComponentIdList } from '@teambit/component-id';
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

/**
 * 3-way merge of the resolved dependencies of a component: base (the common snap), current (the target lane) and
 * other (the merged lane/main).
 *
 * a workspace merge gets the dependencies of the merged component by re-detecting them from the merged files. a bare
 * scope has no node_modules to resolve imports against, so it merges the dependencies that each side resolved when it
 * was snapped instead: a dependency added or removed on one side, or whose version or type (runtime/dev/peer) changed
 * on one side, is taken from that side. it's close to what the detection finds, not identical. e.g. when one side
 * removed an import of a dependency from one file and the other side added an import of it to another file, the
 * dependency is removed, although the merged files still import it.
 *
 * each dependency is keyed by its name, and its field (runtime/dev/peer) is part of what is compared, so a dependency
 * that moved between fields on one side is taken from that side, and it's never added to two fields.
 * when both sides changed the same dependency differently, "theirs" takes other, any other strategy keeps current
 * (in "manual", such a version conflict is reported by the config-merger, which stops the merge before the snap).
 * the returned component dependencies are copies, so they can be changed without changing the inputs.
 *
 * `laneComponentIds` are the components of the current lane. a dependency on one of them gets the lane's version
 * anyway (see MergingMain.setLaneVersionsOfDeps), so its version is not compared. otherwise, the lane snap of it would
 * look like a change on the lane, and a removal of it on the other side would be lost.
 */
export function mergeDependencies(
  base: DependenciesSnapshot,
  current: DependenciesSnapshot,
  other: DependenciesSnapshot,
  mergeStrategy?: MergeStrategy,
  laneComponentIds?: ComponentIdList
): DependenciesSnapshot {
  const componentDeps = (snapshot: DependenciesSnapshot) =>
    new Map(
      COMPONENT_DEPS_FIELDS.flatMap((field) =>
        snapshot[field].get().map((dep) => [dep.id.toStringWithoutVersion(), { field, value: dep }] as const)
      )
    );
  // all the persisted data is compared (e.g. the import paths and the version range), not only the id, so a change of
  // any of them on one side is not lost. (no methods are called, a loaded component has the dependencies as plain objects)
  const isSameDep = (a: Dependency, b: Dependency) =>
    (laneComponentIds?.hasWithoutVersion(a.id) ? a.id.isEqualWithoutVersion(b.id) : a.id.isEqual(b.id)) &&
    a.packageName === b.packageName &&
    a.versionRange === b.versionRange &&
    isEqual(a.relativePaths, b.relativePaths);
  const mergedCompDeps = mergeEntries(
    componentDeps(base),
    componentDeps(current),
    componentDeps(other),
    mergeStrategy,
    isSameDep
  );
  const packageDeps = (snapshot: DependenciesSnapshot) =>
    new Map(
      PACKAGE_DEPS_FIELDS.flatMap((field) =>
        Object.entries(snapshot[field] || {}).map(([name, version]) => [name, { field, value: version }] as const)
      )
    );
  const mergedPkgDeps = mergeEntries(
    packageDeps(base),
    packageDeps(current),
    packageDeps(other),
    mergeStrategy,
    (a, b) => a === b
  );
  const compDepsOf = (field: ComponentDepsField) =>
    new Dependencies(
      mergedCompDeps.filter((entry) => entry.field === field).map(({ value }) => cloneDependency(value))
    );
  const pkgDepsOf = (field: PackageDepsField) =>
    Object.fromEntries(mergedPkgDeps.filter((entry) => entry.field === field).map(({ key, value }) => [key, value]));
  return {
    dependencies: compDepsOf('dependencies'),
    devDependencies: compDepsOf('devDependencies'),
    peerDependencies: compDepsOf('peerDependencies'),
    packageDependencies: pkgDepsOf('packageDependencies'),
    devPackageDependencies: pkgDepsOf('devPackageDependencies'),
    peerPackageDependencies: pkgDepsOf('peerPackageDependencies'),
  };
}

type FieldEntry<Field, Value> = { field: Field; value: Value };

/**
 * 3-way merge of the entries of each key. an entry is unchanged between two sides when it's in the same field with an
 * equal value. returns the merged entries that exist (not removed).
 */
function mergeEntries<Field, Value>(
  base: Map<string, FieldEntry<Field, Value>>,
  current: Map<string, FieldEntry<Field, Value>>,
  other: Map<string, FieldEntry<Field, Value>>,
  mergeStrategy: MergeStrategy | undefined,
  isEqualValue: (a: Value, b: Value) => boolean
): Array<FieldEntry<Field, Value> & { key: string }> {
  return union([...current.keys()], [...other.keys()]).flatMap((key) => {
    const merged = mergeValue(
      base.get(key),
      current.get(key),
      other.get(key),
      mergeStrategy,
      (a, b) => a.field === b.field && isEqualValue(a.value, b.value)
    );
    return merged ? [{ key, ...merged }] : [];
  });
}

/**
 * returns undefined when the merged result is "absent" (removed or never existed).
 */
function mergeValue<T>(
  base: T | undefined,
  current: T | undefined,
  other: T | undefined,
  mergeStrategy: MergeStrategy | undefined,
  isEqualValue: (a: T, b: T) => boolean
): T | undefined {
  const equal = (a?: T, b?: T) => (a === undefined || b === undefined ? a === b : isEqualValue(a, b));
  if (equal(current, other)) return current;
  if (equal(base, current)) return other; // changed (or removed) on other only
  if (equal(base, other)) return current; // changed (or removed) on current only
  return mergeStrategy === 'theirs' ? other : current;
}

function cloneDependency(dep: Dependency): Dependency {
  const clone = Dependency.getClone(dep);
  return new Dependency(clone.id, clone.relativePaths, clone.packageName, clone.versionRange);
}
