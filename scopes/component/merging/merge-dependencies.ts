import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { compact, isEqual, union } from 'lodash';
import type { ComponentIdList } from '@teambit/component-id';
import type { ImportedPackages } from '@teambit/dependencies';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';
import { ModelComponent } from '@teambit/objects';

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
 * the dependencies of a Version, with the package names of the component dependencies, same as a component loaded from
 * the scope has them (see ModelComponent.toConsumerComponent). without them, a dependency of a Version and the same
 * dependency of a loaded component are not equal.
 * returns copies, so they can be changed (e.g. set to a component that is snapped) without changing the Version.
 */
export function getDependenciesOfVersion(
  version: DependenciesSnapshot & { extensions: ExtensionDataList }
): DependenciesSnapshot {
  const withPackageNames = (deps: Dependencies) =>
    new Dependencies(ModelComponent.addDepsInfoFromDepsResolver(deps, version.extensions));
  return {
    dependencies: withPackageNames(version.dependencies),
    devDependencies: withPackageNames(version.devDependencies),
    peerDependencies: withPackageNames(version.peerDependencies),
    packageDependencies: { ...version.packageDependencies },
    devPackageDependencies: { ...version.devPackageDependencies },
    peerPackageDependencies: { ...version.peerPackageDependencies },
  };
}

/**
 * the packages imported by the files of a merge, see detectImportedPackages().
 */
export type ImportsOfMerge = {
  merged: ImportedPackages; // imported by the merged files
  sides: Set<string>; // imported by the files of base, current or other
};

/**
 * 3-way merge of the resolved dependencies of a component: base (the common snap), current (the target lane) and
 * other (the merged lane/main).
 *
 * a workspace merge gets the dependencies of the merged component by re-detecting them from the merged files. a bare
 * scope has no node_modules to resolve imports against, so it merges the dependencies that each side resolved when it
 * was snapped instead: a dependency added or removed on one side, or whose version or type (runtime/dev/peer) changed
 * on one side, is taken from that side.
 *
 * when `imports` is given, the dependencies that come from imports follow the merged files, same as the detection: a
 * dependency that no merged file imports is removed, one that a merged file imports is kept (taken from the side that
 * has it when the 3-way merge removed it), and it's a runtime or dev dependency according to the files that import it.
 * the version is still the one of the 3-way merge. a dependency that no side imports (e.g. one added by a policy) keeps
 * the 3-way result. without `imports`, it's close to the detection, not identical. e.g. when one side removed an
 * import of a dependency from one file and the other side added an import of it to another file, the dependency is
 * removed, although the merged files still import it.
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
  laneComponentIds?: ComponentIdList,
  imports?: ImportsOfMerge
): DependenciesSnapshot {
  const componentDeps = (snapshot: DependenciesSnapshot) =>
    new Map(
      COMPONENT_DEPS_FIELDS.flatMap((field) =>
        snapshot[field].get().map((dep) => [dep.id.toStringWithoutVersion(), { field, value: dep }] as const)
      )
    );
  const applyImportsIfNeeded = <Field extends string, Value>(
    entries: Array<MergedEntry<Field, Value>>,
    sides: Array<Map<string, FieldEntry<Field, Value>>>,
    nameOf: (key: string, value: Value) => string | undefined,
    fields: DepTypeFields<Field>
  ) => (imports ? applyImports(entries, sides, nameOf, fields, imports) : entries);
  // all the persisted data is compared (e.g. the import paths and the version range), not only the id, so a change of
  // any of them on one side is not lost. (no methods are called, a loaded component has the dependencies as plain objects)
  const isSameDep = (a: Dependency, b: Dependency) =>
    (laneComponentIds?.hasWithoutVersion(a.id) ? a.id.isEqualWithoutVersion(b.id) : a.id.isEqual(b.id)) &&
    a.packageName === b.packageName &&
    a.versionRange === b.versionRange &&
    isEqual(a.relativePaths, b.relativePaths);
  const [baseCompDeps, currentCompDeps, otherCompDeps] = [base, current, other].map(componentDeps);
  const mergedCompDeps = applyImportsIfNeeded(
    mergeEntries(baseCompDeps, currentCompDeps, otherCompDeps, mergeStrategy, isSameDep),
    [otherCompDeps, currentCompDeps, baseCompDeps],
    (_key, dep) => dep.packageName,
    { runtime: 'dependencies', dev: 'devDependencies', peer: 'peerDependencies' }
  );
  const packageDeps = (snapshot: DependenciesSnapshot) =>
    new Map(
      PACKAGE_DEPS_FIELDS.flatMap((field) =>
        Object.entries(snapshot[field] || {}).map(([name, version]) => [name, { field, value: version }] as const)
      )
    );
  const [basePkgDeps, currentPkgDeps, otherPkgDeps] = [base, current, other].map(packageDeps);
  const mergedPkgDeps = applyImportsIfNeeded(
    mergeEntries(basePkgDeps, currentPkgDeps, otherPkgDeps, mergeStrategy, (a, b) => a === b),
    [otherPkgDeps, currentPkgDeps, basePkgDeps],
    (key) => key,
    { runtime: 'packageDependencies', dev: 'devPackageDependencies', peer: 'peerPackageDependencies' }
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

/**
 * the dependencies of one side of a merge, and the packages that its dependencies policy ignores ("-").
 */
export type SideOfMerge = { dependencies: DependenciesSnapshot; ignoredPackages: Set<string> };

/**
 * packages that the merged files import, that the merged policy doesn't ignore, and that no side has as a dependency,
 * because the sides that import them ignored them. (e.g. one side imports a package while it's ignored, and the other
 * side removes the "-"). a workspace adds such a package with the version installed in node_modules, a bare scope has
 * no version for it. a types package of it (e.g. @types/foo) is not a version of it.
 */
export function getImportedPackagesWithoutVersion(
  base: SideOfMerge,
  current: SideOfMerge,
  other: SideOfMerge,
  importedByMergedFiles: Iterable<string>
): string[] {
  const sides = [base, current, other];
  const dependencyNames = new Set(sides.flatMap(({ dependencies }) => namesOfDependencies(dependencies)));
  return [...importedByMergedFiles].filter(
    (name) =>
      !dependencyNames.has(name) &&
      sides.some((side) => side.ignoredPackages.has(name)) &&
      !isIgnoredOnMerge(base, current, other, name)
  );
}

/**
 * the imports of a merge without the packages that the merged policy ignores ("-"), so these keep the 3-way result,
 * which follows the policy of each side. e.g. when one side adds a "-" for a package that the files import, the 3-way
 * merge removes it, and the imports don't restore it.
 */
export function withoutIgnoredImports(
  imports: ImportsOfMerge,
  base: SideOfMerge,
  current: SideOfMerge,
  other: SideOfMerge
): ImportsOfMerge {
  const isNotIgnored = (name: string) => !isIgnoredOnMerge(base, current, other, name);
  return {
    merged: new Map([...imports.merged].filter(([name]) => isNotIgnored(name))),
    sides: new Set([...imports.sides].filter(isNotIgnored)),
  };
}

/**
 * whether the merged policy ignores ("-") the package, by a 3-way merge of whether each side ignores it.
 */
function isIgnoredOnMerge(base: SideOfMerge, current: SideOfMerge, other: SideOfMerge, name: string): boolean {
  const [onBase, onCurrent, onOther] = [base, current, other].map((side) => side.ignoredPackages.has(name));
  return Boolean(mergeValue(onBase, onCurrent, onOther, undefined, (a, b) => a === b));
}

function namesOfDependencies(dependencies: DependenciesSnapshot): string[] {
  const componentDeps = COMPONENT_DEPS_FIELDS.flatMap((field) => dependencies[field].get());
  const packageNames = PACKAGE_DEPS_FIELDS.flatMap((field) => Object.keys(dependencies[field] || {}));
  return [...compact(componentDeps.map((dep) => dep.packageName)), ...packageNames];
}

type FieldEntry<Field, Value> = { field: Field; value: Value };
type MergedEntry<Field, Value> = FieldEntry<Field, Value> & { key: string };
type DepTypeFields<Field> = { runtime: Field; dev: Field; peer: Field };

/**
 * make the dependencies that come from imports follow the merged files, see mergeDependencies().
 * `sides` are the entries of other, current and base, in this order of preference, to take a dependency from when the
 * 3-way merge removed it.
 */
function applyImports<Field extends string, Value>(
  entries: Array<MergedEntry<Field, Value>>,
  sides: Array<Map<string, FieldEntry<Field, Value>>>,
  nameOf: (key: string, value: Value) => string | undefined,
  fields: DepTypeFields<Field>,
  imports: ImportsOfMerge
): Array<MergedEntry<Field, Value>> {
  // a types package (e.g. @types/foo) follows the package it types, see AutoDetectDeps._addTypesPackagesForTypeScript
  const importedName = (name: string) => typedPackageName(name) || name;
  const isFromImports = (name: string) =>
    imports.merged.has(importedName(name)) || imports.sides.has(importedName(name));
  const withFieldOfImports = (entry: MergedEntry<Field, Value>, name: string): MergedEntry<Field, Value> => {
    const importedAs = imports.merged.get(name);
    // a peer is set by a policy or by the dependency itself, not by the files that import it
    if (!importedAs || entry.field === fields.peer) return entry;
    return { ...entry, field: fields[importedAs] };
  };
  const result: Array<MergedEntry<Field, Value>> = [];
  const names = new Set<string>();
  entries.forEach((entry) => {
    const name = nameOf(entry.key, entry.value);
    if (!name) {
      result.push(entry);
      return;
    }
    if (isFromImports(name) && !imports.merged.has(importedName(name))) return; // no merged file imports it
    names.add(name);
    result.push(withFieldOfImports(entry, name));
  });
  const sidesByName = sides.map(
    (side) => new Map([...side].map(([key, entry]) => [nameOf(key, entry.value), { key, ...entry }]))
  );
  const importedNames = [...imports.merged.keys()].flatMap((name) => [name, toTypesPackageName(name)]);
  importedNames.forEach((name) => {
    if (names.has(name)) return;
    // when no side has it, it's e.g. a core aspect, or a package that a policy ignores
    const fromSide = sidesByName.map((side) => side.get(name)).find(Boolean);
    if (!fromSide) return;
    names.add(name);
    result.push(withFieldOfImports(fromSide, name));
  });
  return result;
}

/**
 * e.g. "@types/foo" => "foo", "@types/scope__foo" => "@scope/foo". undefined when it's not a types package.
 */
function typedPackageName(name: string): string | undefined {
  if (!name.startsWith('@types/')) return undefined;
  const typed = name.slice('@types/'.length);
  return typed.includes('__') ? `@${typed.replace('__', '/')}` : typed;
}

function toTypesPackageName(name: string): string {
  return `@types/${name.replace(/^@([^/]+)\//, '$1__')}`;
}

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
): Array<MergedEntry<Field, Value>> {
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
