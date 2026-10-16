import semver from 'semver';
import { snapToSemver } from '@teambit/component-package-version';
import { type DependenciesGraph, parseDependenciesGraphNodeId, splitDependenciesGraphPeerIds } from '@teambit/objects';
import type { DependenciesManifest, LifecycleDependenciesManifest } from '../dependencies/dependency-list';

export type GraphAppliedDependencies = {
  dependencies: LifecycleDependenciesManifest;
  devDependencies: LifecycleDependenciesManifest;
  optionalDependencies: LifecycleDependenciesManifest;
  /** The env peers, at the version the graph resolved them to where it did. */
  envPeers: LifecycleDependenciesManifest;
};

const MANIFEST_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/**
 * The versions the graph resolved the component's direct dependencies and
 * their peers to, by package name: each direct dependency's own version, then
 * the versions in its peer suffix, nested suffixes included. A name met at
 * several versions keeps the first one, a direct dependency's own version
 * before any peer's.
 */
export function resolvedVersionsInGraph(graph: DependenciesGraph): Map<string, string> {
  const versions = new Map<string, string>();
  const record = (nodeId: string) => {
    const parsed = parseDependenciesGraphNodeId(nodeId);
    if (parsed && !versions.has(parsed.name)) versions.set(parsed.name, parsed.version);
  };
  const directIds = (graph.findRootEdge()?.neighbours ?? []).map(({ id }) => id);
  directIds.forEach(record);
  const stack = [...directIds];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    for (const peerId of splitDependenciesGraphPeerIds(nodeId)) {
      if (peerId.startsWith('patch_hash=')) continue;
      record(peerId);
      stack.push(peerId);
    }
  }
  return versions;
}

/**
 * Whether a version the graph holds is one the component declares it accepts:
 * an open declaration, the same snap or version, or a range it satisfies the
 * way pnpm reads ranges, so a prerelease satisfies only a range that names
 * one. A dependency on a directory or a workspace package is never taken from
 * the graph.
 */
function declarationAccepts(spec: string | undefined, version: string): boolean {
  if (spec == null || spec === '' || spec === '*') return true;
  if (snapToSemver(spec) === version) return true;
  if (spec.startsWith('workspace:') || spec.startsWith('link:') || spec.startsWith('file:')) return false;
  return semver.validRange(spec) != null && semver.satisfies(version, spec);
}

/** The highest version of `name` among the graph's packages that `spec` accepts. */
function highestHeldVersion(graph: DependenciesGraph, name: string, spec: string): string | undefined {
  let highest: string | undefined;
  for (const pkgId of graph.packages.keys()) {
    const parsed = parseDependenciesGraphNodeId(pkgId);
    if (!parsed || parsed.name !== name || !declarationAccepts(spec, parsed.version)) continue;
    if (highest == null || (semver.valid(parsed.version) && semver.valid(highest) && semver.gt(parsed.version, highest))) {
      highest = parsed.version;
    }
  }
  return highest;
}

/**
 * The dependencies a capsule manifest declares when the component's graph
 * decides the versions: what the component was resolved and tested with, so
 * that a lockfile restored from the same graph satisfies the manifest and the
 * install needs no resolution.
 *
 * - Every direct dependency of the graph's root edge the component declares,
 *   as a dependency, a peer, or through its env's peers, is declared at its
 *   resolved version, under the group the component declares it in, as long
 *   as the declaration accepts that version. A declaration the graph
 *   contradicts (a dependency re-snapped since the graph was saved) wins, and
 *   that dependency is resolved again. A direct dependency the component
 *   declares nowhere, such as an extension the manifest leaves out, stays out:
 *   the graph decides versions, not what is installed.
 * - A declared dependency the root edge lacks keeps its declaration, at the
 *   version the graph resolved it to elsewhere when that satisfies it.
 * - A declared peer the graph resolved becomes a runtime dependency at that
 *   version, which is what a capsule does with peers anyway.
 * - An env peer takes the version the graph resolved it to, where it did.
 *   The env's pin only applies to a peer the graph never met.
 *
 * `exclude` names packages never taken from the graph: the components
 * installed alongside, which are linked, and packages the install removes.
 */
export function applyDependenciesGraph({
  graph,
  declared,
  envPeers,
  exclude,
}: {
  graph: DependenciesGraph;
  declared: DependenciesManifest;
  envPeers: LifecycleDependenciesManifest;
  exclude: Set<string>;
}): GraphAppliedDependencies {
  const versions = resolvedVersionsInGraph(graph);
  const result: GraphAppliedDependencies = {
    dependencies: {},
    devDependencies: {},
    optionalDependencies: {},
    envPeers: {},
  };
  const placed = new Set<string>();
  // Direct dependencies whose declaration the graph contradicts: the
  // declaration changed since the graph was saved, so only a resolution can
  // say what it means now. A version the graph holds elsewhere is no answer.
  const contradicted = new Set<string>();
  const declaredSpec = (name: string): string | undefined =>
    MANIFEST_GROUPS.map((group) => declared[group]?.[name]).find((spec) => spec != null) ??
    declared.peerDependencies?.[name];

  for (const neighbour of graph.findRootEdge()?.neighbours ?? []) {
    const parsed = parseDependenciesGraphNodeId(neighbour.id);
    if (!parsed) continue;
    const name = neighbour.name ?? parsed.name;
    if (exclude.has(name) || placed.has(name)) continue;
    // The graph decides versions, never what the manifest declares: a direct
    // dependency the component declares nowhere, such as an extension the
    // manifest left out on purpose, stays out.
    const spec = declaredSpec(name);
    if (spec == null && !(name in envPeers)) continue;
    if (!declarationAccepts(spec, parsed.version)) {
      contradicted.add(name);
      continue;
    }
    // Under the group the component declares it in, else the one the graph
    // records: the lifecycle of the workspace's own declaration.
    const group =
      MANIFEST_GROUPS.find((candidate) => declared[candidate]?.[name] != null) ??
      (neighbour.lifecycle === 'dev' ? 'devDependencies' : neighbour.optional ? 'optionalDependencies' : 'dependencies');
    result[group][name] = parsed.version;
    placed.add(name);
  }
  // A declared dependency the root edge lacks: the version the graph resolved
  // it to as a peer, or, failing that, the highest version it holds anywhere
  // in the tree that the declaration accepts. A workspace install hoists some
  // of a component's declared dependencies to its root, so the graph meets
  // them only deeper down.
  const versionHeldFor = (name: string, spec: string): string | undefined => {
    if (exclude.has(name) || contradicted.has(name)) return undefined;
    const resolved = versions.get(name);
    if (resolved != null && declarationAccepts(spec, resolved)) return resolved;
    return highestHeldVersion(graph, name, spec);
  };
  for (const group of MANIFEST_GROUPS) {
    for (const [name, spec] of Object.entries(declared[group] ?? {})) {
      if (placed.has(name)) continue;
      result[group][name] = versionHeldFor(name, spec) ?? spec;
      placed.add(name);
    }
  }
  for (const [name, spec] of Object.entries(declared.peerDependencies ?? {})) {
    if (placed.has(name)) continue;
    const version = versionHeldFor(name, spec);
    if (version != null) {
      result.dependencies[name] = version;
      placed.add(name);
    }
  }
  for (const [name, spec] of Object.entries(envPeers)) {
    if (placed.has(name)) continue;
    result.envPeers[name] = (!exclude.has(name) && versions.get(name)) || spec;
  }
  return result;
}
