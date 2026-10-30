import semver from 'semver';
import type { LockfilePackageInfo, LockfileSettings } from '@pnpm/lockfile.types';

export type PackagesMap = Map<string, PackageAttributes>;

export type PackageAttributes = LockfilePackageInfo & {
  component?: {
    scope: string;
    name: string;
  };
  requiresBuild?: boolean;
};

export type DependencyEdge = {
  id: string;
  neighbours: DependencyNeighbour[];
  attr?: {
    pkgId?: string;
    transitivePeerDependencies?: string[];
  };
};

export type DependencyNeighbour = {
  id: string;
  /**
   * This is true when the dependency is from optionalDependencies.
   */
  optional?: boolean;
  name?: string;
  specifier?: string;
  lifecycle?: 'runtime' | 'dev';
};

const DEPENDENCIES_GRAPH_SCHEMA_VERSION = '2.0';

/**
 * The `pnpmfileChecksum` of graphs resolved with Bit's readPackage hooks. Those
 * hooks removed `@teambit/legacy` and `@teambit/harmony` from every dependency.
 * Bit now passes no hooks and removes them with the overrides below instead
 * (`removedCoreDependencyOverrides` in the pnpm aspect), so such a graph holds
 * the resolution those overrides produce. A workspace that forced a harmony
 * version kept harmony, but it also recorded a harmony override, which no
 * restored lockfile carried, so its graphs were never reused either way.
 */
const READ_PACKAGE_HOOKS_CHECKSUM = 'bit-1';
const READ_PACKAGE_HOOKS_OVERRIDES: Record<string, string> = {
  '@teambit/legacy@*': '-',
  '@teambit/harmony@*': '-',
};

export class DependenciesGraph {
  static ROOT_EDGE_ID = '.';

  schemaVersion: string;
  packages: PackagesMap;
  edges: DependencyEdge[];
  /**
   * The `pnpmfileChecksum` of the lockfile the graph was created from: an id of
   * the readPackage hooks the dependencies were resolved with. A lockfile
   * restored from the graph carries it, so pnpm trusts the restored resolution
   * only while Bit's hooks are still the same. Graphs created before this field
   * existed don't have it.
   */
  pnpmfileChecksum?: string;
  /**
   * The `settings` block of the lockfile the graph was created from: the
   * resolution settings (dedupePeers, injectWorkspacePackages, ...) the
   * dependencies were resolved under. A lockfile restored from the graph
   * carries them, so pnpm can install the restored resolution without
   * resolving again while the install's settings still match. Graphs created
   * before this field existed don't have it, and pnpm resolves them again.
   */
  lockfileSettings?: LockfileSettings;
  /**
   * The `overrides` of the lockfile the graph was created from. A lockfile
   * restored from the graph carries them, so pnpm trusts the restored
   * resolution only while the install's overrides are the same.
   */
  overrides?: Record<string, string>;

  constructor({
    packages,
    edges,
    schemaVersion,
    pnpmfileChecksum,
    lockfileSettings,
    overrides,
  }: {
    packages: PackagesMap;
    edges: DependencyEdge[];
    schemaVersion?: string;
    pnpmfileChecksum?: string;
    lockfileSettings?: LockfileSettings;
    overrides?: Record<string, string>;
  }) {
    this.packages = packages;
    this.edges = edges;
    this.schemaVersion = schemaVersion ?? DEPENDENCIES_GRAPH_SCHEMA_VERSION;
    if (pnpmfileChecksum === READ_PACKAGE_HOOKS_CHECKSUM && overrides == null) {
      this.overrides = { ...READ_PACKAGE_HOOKS_OVERRIDES };
    } else {
      this.pnpmfileChecksum = pnpmfileChecksum;
      this.overrides = overrides;
    }
    this.lockfileSettings = lockfileSettings;
  }

  serialize(): string {
    return JSON.stringify({
      schemaVersion: this.schemaVersion,
      packages: Object.fromEntries(this.packages.entries()),
      edges: this.edges,
      // JSON.stringify omits these when undefined.
      pnpmfileChecksum: this.pnpmfileChecksum,
      lockfileSettings: this.lockfileSettings,
      overrides: this.overrides,
    });
  }

  static deserialize(data: string): DependenciesGraph | undefined {
    const parsed = JSON.parse(data);
    // If the schema version is not supported, then we just ignore the data
    if (parsed.schemaVersion !== DEPENDENCIES_GRAPH_SCHEMA_VERSION) {
      return undefined;
    }
    return new DependenciesGraph({
      schemaVersion: parsed.schemaVersion,
      edges: parsed.edges,
      packages: new Map(Object.entries(parsed.packages)),
      pnpmfileChecksum: parsed.pnpmfileChecksum,
      lockfileSettings: parsed.lockfileSettings,
      overrides: parsed.overrides,
    });
  }

  merge(graph: DependenciesGraph): void {
    this.pnpmfileChecksum = mergePnpmfileChecksums(this, graph);
    this.lockfileSettings = mergeLockfileSettings(this, graph);
    this.overrides = mergeOverrides(this, graph);
    const rootEdge = this.findRootEdge();
    const incomingRootEdge = graph.findRootEdge();
    const directDependencies = incomingRootEdge?.neighbours;
    if (directDependencies && rootEdge) {
      for (const directDep of directDependencies) {
        const existingDirectDep = rootEdge.neighbours.find((existingDep) =>
          isSameDirectDependency(existingDep, directDep)
        );
        if (existingDirectDep == null) {
          rootEdge.neighbours.push(directDep);
        } else {
          if (isWildcardSpecifier(existingDirectDep.specifier) && !isWildcardSpecifier(directDep.specifier)) {
            existingDirectDep.specifier = directDep.specifier;
          }
          if (existingDirectDep.id !== directDep.id && nodeIdLessThan(existingDirectDep.id, directDep.id)) {
            existingDirectDep.id = directDep.id;
          }
        }
      }
    } else if (incomingRootEdge) {
      this.edges.push(incomingRootEdge);
    }
    for (const [newPkgId, newPkgAttr] of graph.packages.entries()) {
      this.packages.set(newPkgId, newPkgAttr);
    }
    this.edges.push(...graph.edges.filter(({ id }) => id !== DependenciesGraph.ROOT_EDGE_ID));
    this.normalizePeerProviderVersions();
    this.pruneUnreachableFromRoot();
  }

  isEmpty(): boolean {
    return this.packages.size === 0 && this.edges.length === 0;
  }

  /**
   * Whether the graph holds any resolved dependency. A component without
   * dependencies has only an empty root edge.
   */
  hasResolutions(): boolean {
    return (
      this.packages.size > 0 ||
      this.edges.some(({ id, neighbours }) => id !== DependenciesGraph.ROOT_EDGE_ID || neighbours.length > 0)
    );
  }

  /**
   * Returns the edge related to the root component
   */
  findRootEdge(): DependencyEdge | undefined {
    return this.edges.find(({ id }) => id === DependenciesGraph.ROOT_EDGE_ID);
  }

  private pruneUnreachableFromRoot(): void {
    const rootEdge = this.findRootEdge();
    if (!rootEdge) return;
    const edgesById = new Map<string, DependencyEdge>();
    for (const edge of this.edges) {
      if (edge.id !== DependenciesGraph.ROOT_EDGE_ID) {
        edgesById.set(edge.id, edge);
      }
    }
    const reachableEdges = new Set<string>();
    const reachablePackages = new Set<string>();
    // An explicit stack: deep dependency chains would overflow the call
    // stack with a recursive walk. Every node id is processed once — the
    // guard must sit before the suffix pushes, or a node referenced by M
    // edges re-pushes its suffix ids M times and nested suffixes multiply
    // that per level.
    const visited = new Set<string>();
    const stack = rootEdge.neighbours.map((neighbour) => neighbour.id);
    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      reachablePackages.add(nodeIdWithoutPeerSuffix(nodeId));
      for (const peerId of splitPeerIds(nodeId)) {
        if (!isPatchHashSegment(peerId)) stack.push(peerId);
      }
      const edge = edgesById.get(nodeId);
      if (!edge) continue;
      reachableEdges.add(nodeId);
      if (edge.attr?.pkgId) reachablePackages.add(edge.attr.pkgId);
      for (const neighbour of edge.neighbours) {
        stack.push(neighbour.id);
      }
    }
    this.edges = [rootEdge, ...Array.from(edgesById.values()).filter((edge) => reachableEdges.has(edge.id))];
    for (const pkgId of this.packages.keys()) {
      if (!reachablePackages.has(pkgId)) {
        this.packages.delete(pkgId);
      }
    }
  }

  private normalizePeerProviderVersions(): void {
    const versionsByPackageName = this.collectVersionsByPackageName();
    const getBestCompatiblePeer = (name: string, range: string) =>
      versionsByPackageName
        .get(name)
        ?.find(({ version }) => semver.satisfies(version, range, { includePrerelease: true }));
    const getHighestPeer = (name: string) => versionsByPackageName.get(name)?.[0];
    const rewritePeerId = (peerId: string, peerDependencies?: Record<string, string>): string => {
      const parsedPeer = parsePkgId(peerId);
      const nestedPeerDependencies = this.packages.get(nodeIdWithoutPeerSuffix(peerId))?.peerDependencies;
      const peerIds = splitPeerIds(peerId).map((nestedPeerId) => rewritePeerId(nestedPeerId, nestedPeerDependencies));
      let rewrittenBase = nodeIdWithoutPeerSuffix(peerId);
      if (parsedPeer) {
        const range = peerDependencies?.[parsedPeer.name];
        const bestPeer = range ? getBestCompatiblePeer(parsedPeer.name, range) : getHighestPeer(parsedPeer.name);
        if (bestPeer) rewrittenBase = `${parsedPeer.name}@${bestPeer.version}`;
      }
      return `${rewrittenBase}${createPeerSuffix(peerIds)}`;
    };
    const rewritePeerDep = (
      depId: string,
      peerDependencies?: Record<string, string>,
      peerIdsByName?: Map<string, string>
    ) => {
      const peerId = peerIdsByName?.get(parsePkgId(depId)?.name ?? '');
      if (peerId) return peerId;
      if (!peerDependencies) return depId;
      const parsedDep = parsePkgId(depId);
      if (!parsedDep) return depId;
      const range = peerDependencies[parsedDep.name];
      if (!range) return depId;
      const bestPeer = getBestCompatiblePeer(parsedDep.name, range);
      if (!bestPeer) return depId;
      return `${parsedDep.name}@${bestPeer.version}`;
    };
    const rewriteNodeId = (nodeId: string) => {
      const pkgId = nodeIdWithoutPeerSuffix(nodeId);
      const peerDependencies = this.packages.get(pkgId)?.peerDependencies;
      const peerIds = splitPeerIds(nodeId);
      if (peerIds.length === 0) return nodeId;
      let changed = false;
      const rewrittenPeerIds = peerIds.map((peerId) => {
        const rewrittenPeerId = rewritePeerId(peerId, peerDependencies);
        if (rewrittenPeerId === peerId) return peerId;
        changed = true;
        return rewrittenPeerId;
      });
      if (!changed) return nodeId;
      return `${pkgId}${createPeerSuffix(rewrittenPeerIds)}`;
    };
    const rewriteNeighbour = (
      neighbour: DependencyNeighbour,
      peerDependencies?: Record<string, string>,
      peerIdsByName?: Map<string, string>
    ) => {
      const rewrittenId = rewriteNodeId(rewritePeerDep(neighbour.id, peerDependencies, peerIdsByName));
      return rewrittenId === neighbour.id ? neighbour : { ...neighbour, id: rewrittenId };
    };
    const edgesById = new Map<string, DependencyEdge>();
    for (const edge of this.edges) {
      const peerDependencies =
        edge.id === DependenciesGraph.ROOT_EDGE_ID
          ? undefined
          : this.packages.get(edge.attr?.pkgId ?? nodeIdWithoutPeerSuffix(edge.id))?.peerDependencies;
      const peerIdsByName = new Map<string, string>();
      for (const peerId of splitPeerIds(edge.id)) {
        const rewrittenPeerId = rewritePeerId(peerId, peerDependencies);
        const parsedPeer = parsePkgId(rewrittenPeerId);
        if (parsedPeer) peerIdsByName.set(parsedPeer.name, rewrittenPeerId);
      }
      const rewrittenEdge: DependencyEdge = {
        ...edge,
        id: edge.id === DependenciesGraph.ROOT_EDGE_ID ? edge.id : rewriteNodeId(edge.id),
        neighbours: edge.neighbours.map((neighbour) => rewriteNeighbour(neighbour, peerDependencies, peerIdsByName)),
      };
      const existingEdge = edgesById.get(rewrittenEdge.id);
      if (existingEdge) {
        mergeNeighbours(existingEdge.neighbours, rewrittenEdge.neighbours);
      } else {
        edgesById.set(rewrittenEdge.id, rewrittenEdge);
      }
    }
    this.edges = Array.from(edgesById.values());
  }

  private collectVersionsByPackageName(): Map<string, Array<{ version: string }>> {
    const versionsByPackageName = new Map<string, Array<{ version: string }>>();
    const addVersion = (pkgId: string) => {
      const parsed = parsePkgId(pkgId);
      if (!parsed || !semver.valid(parsed.version)) return;
      const versions = versionsByPackageName.get(parsed.name) ?? [];
      versions.push({ version: parsed.version });
      versionsByPackageName.set(parsed.name, versions);
      for (const peerId of splitPeerIds(pkgId)) {
        addVersion(peerId);
      }
    };
    for (const pkgId of this.packages.keys()) {
      addVersion(pkgId);
    }
    for (const edge of this.edges) {
      addVersion(edge.id);
      for (const neighbour of edge.neighbours) {
        addVersion(neighbour.id);
      }
    }
    for (const versions of versionsByPackageName.values()) {
      versions.sort((version1, version2) => semver.rcompare(version1.version, version2.version));
    }
    return versionsByPackageName;
  }
}

/**
 * The merged graph mixes resolutions from both graphs. It can only claim a set
 * of readPackage hooks when both were resolved with the same ones; otherwise
 * it is left unset, so pnpm resolves again instead of trusting it. A graph
 * without resolutions has nothing to vouch for, so it doesn't count.
 */
function mergePnpmfileChecksums(graph1: DependenciesGraph, graph2: DependenciesGraph): string | undefined {
  if (!graph2.hasResolutions()) return graph1.pnpmfileChecksum;
  if (!graph1.hasResolutions()) return graph2.pnpmfileChecksum;
  return graph1.pnpmfileChecksum === graph2.pnpmfileChecksum ? graph1.pnpmfileChecksum : undefined;
}

/**
 * A merged graph mixes resolutions from both graphs, so it can only claim the
 * settings both were resolved under.
 */
function mergeLockfileSettings(graph1: DependenciesGraph, graph2: DependenciesGraph): LockfileSettings | undefined {
  if (!graph2.hasResolutions()) return graph1.lockfileSettings;
  if (!graph1.hasResolutions()) return graph2.lockfileSettings;
  return sameRecords(graph1.lockfileSettings, graph2.lockfileSettings) ? graph1.lockfileSettings : undefined;
}

/**
 * A merged graph mixes resolutions from both graphs, so it can only claim the
 * overrides both were resolved with.
 */
function mergeOverrides(graph1: DependenciesGraph, graph2: DependenciesGraph): Record<string, string> | undefined {
  if (!graph2.hasResolutions()) return graph1.overrides;
  if (!graph1.hasResolutions()) return graph2.overrides;
  return sameRecords(graph1.overrides, graph2.overrides) ? graph1.overrides : undefined;
}

function sameRecords(record1?: object, record2?: object): boolean {
  if (record1 == null || record2 == null) return record1 === record2;
  const keys = new Set([...Object.keys(record1), ...Object.keys(record2)]);
  return [...keys].every((key) => record1[key] === record2[key]);
}

function isSameDirectDependency(dep1: DependencyNeighbour, dep2: DependencyNeighbour): boolean {
  if (!dep1.name || !dep2.name) return dep1.id === dep2.id;
  if (dep1.name !== dep2.name) return false;
  return (
    dep1.specifier === dep2.specifier || isWildcardSpecifier(dep1.specifier) || isWildcardSpecifier(dep2.specifier)
  );
}

function isWildcardSpecifier(specifier?: string): boolean {
  return specifier === '*' || specifier == null || specifier === '';
}

function nodeIdLessThan(nodeId1: string, nodeId2: string): boolean {
  const version1 = getVersionFromNodeId(nodeId1);
  if (!version1) return false;
  const version2 = getVersionFromNodeId(nodeId2);
  if (!version2) return false;
  return semver.lt(version1, version2);
}

function mergeNeighbours(existingNeighbours: DependencyNeighbour[], newNeighbours: DependencyNeighbour[]): void {
  for (const newNeighbour of newNeighbours) {
    const existingNeighbour = existingNeighbours.find((neighbour) => neighbour.id === newNeighbour.id);
    if (!existingNeighbour) existingNeighbours.push(newNeighbour);
  }
}

function parsePkgId(pkgId: string): { name: string; version: string } | undefined {
  const depPathWithoutPeerSuffix = nodeIdWithoutPeerSuffix(pkgId);
  const versionStart = depPathWithoutPeerSuffix.lastIndexOf('@');
  if (versionStart <= 0) return undefined;
  const name = depPathWithoutPeerSuffix.slice(0, versionStart);
  const version = depPathWithoutPeerSuffix.slice(versionStart + 1);
  if (!name || !version) return undefined;
  return { name, version };
}

function splitPeerIds(nodeId: string): string[] {
  const suffixStart = nodeId.indexOf('(');
  if (suffixStart === -1) return [];
  const peerIds: string[] = [];
  let depth = 0;
  let peerStart: number | undefined;
  for (let index = suffixStart; index < nodeId.length; index += 1) {
    const char = nodeId[index];
    if (char === '(') {
      if (depth === 0) peerStart = index + 1;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && peerStart != null) {
        peerIds.push(nodeId.slice(peerStart, index));
        peerStart = undefined;
      }
    }
  }
  return peerIds;
}

function createPeerSuffix(peerIds: string[]): string {
  const patchSegments = peerIds.filter(isPatchHashSegment);
  const peerSegments = peerIds.filter((peerId) => !isPatchHashSegment(peerId)).sort();
  return [...patchSegments, ...peerSegments].map((peerId) => `(${peerId})`).join('');
}

function isPatchHashSegment(segment: string): boolean {
  return segment.startsWith('patch_hash=');
}

function getVersionFromNodeId(nodeId: string): string | undefined {
  const depPathWithoutPeerSuffix = nodeIdWithoutPeerSuffix(nodeId);
  const versionStart = depPathWithoutPeerSuffix.lastIndexOf('@');
  if (versionStart === -1) return undefined;
  const version = depPathWithoutPeerSuffix.slice(versionStart + 1);
  return semver.valid(version) ?? semver.coerce(version)?.version;
}

function nodeIdWithoutPeerSuffix(nodeId: string): string {
  const suffixStart = nodeId.indexOf('(');
  return suffixStart === -1 ? nodeId : nodeId.slice(0, suffixStart);
}
