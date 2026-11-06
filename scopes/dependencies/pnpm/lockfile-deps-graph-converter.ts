import path from 'path';
import { type ProjectManifest } from '@pnpm/types';
import {
  type LockfileFile,
  type LockfileFileProjectResolvedDependencies,
  type LockfileFileProjectSnapshot,
} from '@pnpm/lockfile.types';
import type * as Dp from '@pnpm/deps.path';
import { escapeRegExp, omit, pick, partition } from 'lodash';
import type * as ParseOverridesModule from '@pnpm/config.parse-overrides';
import { BitError } from '@teambit/bit-error';
import { snapToSemver } from '@teambit/component-package-version';
import semver from 'semver';
import {
  DependenciesGraph,
  splitDependenciesGraphPeerIds,
  type PackagesMap,
  type PackageAttributes,
  type DependencyEdge,
  type DependencyNeighbour,
} from '@teambit/objects';
import {
  type CalcDepsGraphOptions,
  type CalcDepsGraphForComponentOptions,
  type ComponentIdByPkgName,
} from '@teambit/dependency-resolver';
import normalizePath from 'normalize-path';
import { type BitLockfileFile } from './lynx';

/**
 * Minimal structural signature of the `resolve` function returned by
 * `generateResolverAndFetcher` in `./lynx` (backed by `@pnpm/napi`'s
 * `resolveDependency`). Only the parts this module consumes are typed.
 */
type ResolveFunction = (
  wantedDependency: { alias?: string; bareSpecifier?: string },
  opts: { lockfileDir?: string; projectDir?: string; preferredVersions?: Record<string, unknown> }
) => Promise<{
  resolution?: Record<string, unknown>;
  /** The resolved package's manifest; a registry package's carries its tarball's integrity in `dist`. */
  manifest?: unknown;
}>;

/**
 * The integrity a resolution carries: in `resolution` when the resolver
 * reports one, else in the resolved manifest's `dist`, which is where
 * `@pnpm/napi`'s `resolveDependency` reports a registry package's.
 */
function resolvedIntegrity(resolveResult: Awaited<ReturnType<ResolveFunction>>): string | undefined {
  const { resolution, manifest } = resolveResult;
  if (resolution != null && typeof resolution.integrity === 'string' && resolution.integrity) {
    return resolution.integrity;
  }
  const dist = (manifest as { dist?: { integrity?: unknown } } | undefined)?.dist;
  return typeof dist?.integrity === 'string' && dist.integrity ? dist.integrity : undefined;
}

// @pnpm/deps.path is ESM-only; load it through a .cjs shim so the require()
// chain in the build capsule's mocha runner doesn't trip on the transitive ESM
// import. Call `init()` once before invoking the public converters; helpers
// reach for this module-level slot synchronously.
let dp!: typeof Dp;
let parseOverrides!: typeof ParseOverridesModule.parseOverrides;
let loading: Promise<void> | undefined;

function ensureInitialized(): void {
  if (!dp) {
    throw new Error('lockfile-deps-graph-converter: await init() before calling the converters');
  }
}

export function init(): Promise<void> {
  loading ??= (async () => {
    const { loadEsm } = require('./load-pnpm-esm.cjs') as {
      loadEsm: () => Promise<{ dp: typeof Dp; parseOverrides: typeof ParseOverridesModule.parseOverrides }>;
    };
    const m = await loadEsm();
    dp = m.dp;
    parseOverrides = m.parseOverrides;
  })();
  return loading;
}

/**
 * The lockfile's id for the importer at `projectDir`: its POSIX-normalized
 * path relative to the lockfile root, or `.` for the root project itself.
 */
function getLockfileImporterId(lockfileDir: string, projectDir: string): string {
  return normalizePath(path.relative(lockfileDir, projectDir)) || '.';
}

function scrubOwnComponentFromLockfile(lockfile: BitLockfileFile, pkgName?: string): BitLockfileFile {
  if (!pkgName) return lockfile;
  const prefix = `${pkgName}@`;
  let snapshots: BitLockfileFile['snapshots'] = lockfile.snapshots;
  let snapshotsCopied = false;
  const ensureSnapshotsCopy = () => {
    if (!snapshotsCopied && snapshots) {
      snapshots = { ...snapshots };
      snapshotsCopied = true;
    }
  };
  for (const depPath of Object.keys(snapshots ?? {})) {
    if (depPath.startsWith(prefix) && depPath.slice(prefix.length).startsWith('file:')) {
      ensureSnapshotsCopy();
      delete snapshots![depPath];
    }
  }
  let packages: BitLockfileFile['packages'] = lockfile.packages;
  let packagesCopied = false;
  for (const pkgId of Object.keys(packages ?? {})) {
    if (pkgId.startsWith(prefix) && pkgId.slice(prefix.length).startsWith('file:')) {
      if (!packagesCopied && packages) {
        packages = { ...packages };
        packagesCopied = true;
      }
      delete packages![pkgId];
    }
  }
  for (const [depPath, snapshot] of Object.entries(snapshots ?? {})) {
    let snapshotCopied = false;
    let currentSnapshot = snapshot;
    for (const depType of ['dependencies', 'optionalDependencies'] as const) {
      const deps = currentSnapshot[depType];
      if (deps && deps[pkgName]?.startsWith('file:')) {
        ensureSnapshotsCopy();
        if (!snapshotCopied) {
          currentSnapshot = { ...currentSnapshot };
          snapshots![depPath] = currentSnapshot;
          snapshotCopied = true;
        }
        const nextDeps = { ...deps };
        delete nextDeps[pkgName];
        if (Object.keys(nextDeps).length === 0) {
          delete currentSnapshot[depType];
        } else {
          currentSnapshot[depType] = nextDeps;
        }
      }
    }
  }
  if (!snapshotsCopied && !packagesCopied) return lockfile;
  return {
    ...lockfile,
    snapshots,
    packages,
  };
}

export interface LockfileToGraphCache {
  edges: WeakMap<object, { depPath: string; edge: DependencyEdge | null }>;
  packages: WeakMap<object, { pkgId: string; replacedPkgId: string; graphPkg: PackageAttributes }>;
  componentIdByPkgName?: ComponentIdByPkgName;
  depsRequiringBuild?: string[];
  contextKey?: string;
  replaceFileVersion?: (s: string) => string;
}

export function createLockfileToGraphCache(): LockfileToGraphCache {
  return {
    edges: new WeakMap(),
    packages: new WeakMap(),
  };
}

function getCacheContextKey(componentIdByPkgName: ComponentIdByPkgName, depsRequiringBuild?: string[]): string {
  let key = '';
  for (const [pkgName, compId] of componentIdByPkgName.entries()) {
    key += `${pkgName}:${compId.scope}/${compId.fullName}@${compId.version};`;
  }
  if (depsRequiringBuild?.length) {
    key += `|build:${depsRequiringBuild.join(',')}`;
  }
  return key;
}

function convertLockfileToGraphFromCapsule(
  lockfile: BitLockfileFile,
  {
    pkgName,
    componentRelativeDir,
    componentIdByPkgName,
    replaceFileVersion,
    narrowToComponentImporter = false,
    cache,
  }: Pick<
    CalcDepsGraphOptions & CalcDepsGraphForComponentOptions,
    'pkgName' | 'componentRelativeDir' | 'componentIdByPkgName'
  > & {
    replaceFileVersion?: (s: string) => string;
    narrowToComponentImporter?: boolean;
    cache?: LockfileToGraphCache;
  }
): DependenciesGraph {
  const narrowedLockfile = scrubOwnComponentFromLockfile(
    narrowToComponentImporter ? filterLockfileByImporters(lockfile, [componentRelativeDir]) : lockfile,
    pkgName
  );
  const componentImporter = narrowedLockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const, 'devDependencies' as const]) {
    if (componentImporter[depType] != null) {
      const lifecycle = depType === 'devDependencies' ? 'dev' : 'runtime';
      const optional = depType === 'optionalDependencies';
      directDependencies.push(...importerDepsToNeighbours(componentImporter[depType]!, lifecycle, optional));
    }
  }
  return _convertLockfileToGraph(narrowedLockfile, {
    componentIdByPkgName,
    directDependencies,
    replaceFileVersion,
    cache,
  });
}

function importerDepsToNeighbours(
  importerDependencies: LockfileFileProjectResolvedDependencies,
  lifecycle: 'dev' | 'runtime',
  optional: boolean
): DependencyNeighbour[] {
  const neighbours: DependencyNeighbour[] = [];
  for (const [name, { version, specifier }] of Object.entries(importerDependencies) as any) {
    // `refToRelative` yields null for non-registry refs (`link:` and
    // friends) — those are workspace wiring, not graph nodes.
    const id = dp.refToRelative(version, name);
    if (id == null) continue;
    neighbours.push({ name, specifier, id, lifecycle, optional });
  }
  return neighbours;
}

export function convertLockfileToGraph(
  lockfile: BitLockfileFile,
  {
    pkgName,
    componentRootDir,
    componentRelativeDir,
    componentIdByPkgName,
    replaceFileVersion,
    cache,
  }: Omit<CalcDepsGraphOptions & CalcDepsGraphForComponentOptions, 'rootDir' | 'components' | 'component'> & {
    replaceFileVersion?: (s: string) => string;
    cache?: LockfileToGraphCache;
  }
): DependenciesGraph {
  ensureInitialized();
  if (componentRootDir == null || pkgName == null) {
    return convertLockfileToGraphFromCapsule(lockfile, {
      pkgName,
      componentRelativeDir,
      componentIdByPkgName,
      replaceFileVersion,
      cache,
    });
  }
  const rootImporterDeps = lockfile.importers![componentRootDir]?.dependencies?.[pkgName];
  if (rootImporterDeps == null) {
    return convertLockfileToGraphFromCapsule(lockfile, {
      pkgName,
      componentRelativeDir,
      componentIdByPkgName,
      replaceFileVersion,
      narrowToComponentImporter: lockfile.importers?.[componentRootDir] != null,
      cache,
    });
  }
  const lockedFileVersion = rootImporterDeps.version;
  const lockedPkgDepPath = `${pkgName}@${lockedFileVersion}`;
  const lockedPkg = lockfile.snapshots?.[lockedPkgDepPath];
  if (lockedPkg == null) {
    return convertLockfileToGraphFromCapsule(lockfile, {
      pkgName,
      componentRelativeDir,
      componentIdByPkgName,
      replaceFileVersion,
      narrowToComponentImporter: lockfile.importers?.[componentRootDir] != null,
      cache,
    });
  }
  const componentDevImporter = lockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  if (componentDevImporter.devDependencies != null) {
    directDependencies.push(...importerDepsToNeighbours(componentDevImporter.devDependencies, 'dev', false));
  }
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const]) {
    const optional = depType === 'optionalDependencies';
    for (const [name, version] of Object.entries(lockedPkg[depType] ?? {})) {
      const id = dp.refToRelative(version, name);
      if (id == null) continue;
      directDependencies.push({
        name,
        specifier: componentDevImporter[depType]?.[name]?.specifier ?? '*',
        id,
        lifecycle: 'runtime',
        optional,
      });
    }
  }
  const snapshots = { ...lockfile.snapshots };
  const packages = { ...lockfile.packages };
  delete snapshots[lockedPkgDepPath];
  delete packages[dp.removeSuffix(lockedPkgDepPath)];
  // Scrub back-edges from a circular workspace dep (another workspace
  // component depending on the one we're processing). Otherwise the
  // back-edge survives buildEdges but its target — the just-deleted
  // pkgId — has no entry in buildPackages, leaving a dangling neighbour.
  // convertGraphToLockfile would later materialise that neighbour as an
  // empty packages entry and ask the registry for the workspace
  // snap-version, which may never have been published.
  for (const [depPath, snapshot] of Object.entries(snapshots)) {
    let snapshotCopied = false;
    let currentSnapshot = snapshot;
    for (const depType of ['dependencies', 'optionalDependencies'] as const) {
      const deps = currentSnapshot[depType];
      if (deps?.[pkgName] === lockedFileVersion) {
        if (!snapshotCopied) {
          currentSnapshot = { ...currentSnapshot };
          snapshots[depPath] = currentSnapshot;
          snapshotCopied = true;
        }
        const nextDeps = { ...deps };
        delete nextDeps[pkgName];
        if (Object.keys(nextDeps).length === 0) {
          delete currentSnapshot[depType];
        } else {
          currentSnapshot[depType] = nextDeps;
        }
      }
    }
  }
  return _convertLockfileToGraph(
    { ...lockfile, snapshots, packages },
    { componentIdByPkgName, directDependencies, replaceFileVersion, cache }
  );
}

function _convertLockfileToGraph(
  lockfile: BitLockfileFile,
  {
    componentIdByPkgName,
    directDependencies,
    replaceFileVersion,
    cache,
  }: {
    componentIdByPkgName: ComponentIdByPkgName;
    directDependencies: DependencyNeighbour[];
    replaceFileVersion?: (s: string) => string;
    cache?: LockfileToGraphCache;
  }
): DependenciesGraph {
  let resolvedReplacer = replaceFileVersion;
  if (cache) {
    const depsRequiringBuild = lockfile.bit?.depsRequiringBuild;
    let isContextChanged =
      replaceFileVersion != null && cache.replaceFileVersion != null && cache.replaceFileVersion !== replaceFileVersion;
    if (cache.componentIdByPkgName !== componentIdByPkgName || cache.depsRequiringBuild !== depsRequiringBuild) {
      const contextKey = getCacheContextKey(componentIdByPkgName, depsRequiringBuild);
      if (cache.contextKey !== contextKey) {
        isContextChanged = true;
        cache.contextKey = contextKey;
      }
      cache.componentIdByPkgName = componentIdByPkgName;
      cache.depsRequiringBuild = depsRequiringBuild;
    }
    if (isContextChanged) {
      cache.edges = new WeakMap();
      cache.packages = new WeakMap();
      cache.replaceFileVersion = undefined;
    }
    resolvedReplacer ??= cache.replaceFileVersion ?? createFileVersionReplacer(componentIdByPkgName);
    cache.replaceFileVersion = resolvedReplacer;
  } else {
    resolvedReplacer ??= createFileVersionReplacer(componentIdByPkgName);
  }
  const graph = new DependenciesGraph({
    edges: buildEdges(lockfile, {
      directDependencies,
      replaceFileVersion: resolvedReplacer,
      edgesCache: cache?.edges,
    }),
    packages: buildPackages(lockfile, {
      componentIdByPkgName,
      replaceFileVersion: resolvedReplacer,
      packagesCache: cache?.packages,
    }),
    pnpmfileChecksum: lockfile.pnpmfileChecksum,
    lockfileSettings: lockfile.settings,
    overrides: lockfile.overrides,
  });
  dropOrphanFilePkgs(graph);
  return graph;
}

function buildEdges(
  lockfile: BitLockfileFile,
  {
    directDependencies,
    replaceFileVersion,
    edgesCache,
  }: {
    directDependencies: DependencyNeighbour[];
    replaceFileVersion: (s: string) => string;
    edgesCache?: LockfileToGraphCache['edges'];
  }
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const cached = edgesCache?.get(snapshot);
    let edge: DependencyEdge | null;
    if (cached && cached.depPath === depPath) {
      edge = cached.edge;
    } else {
      const neighbours = extractDependenciesFromSnapshot(snapshot, replaceFileVersion);
      const replacedDepPath = replaceFileVersion(depPath);
      const candidate: DependencyEdge = {
        id: replacedDepPath,
        neighbours,
      };
      const pkgId = dp.removeSuffix(replacedDepPath);
      if (pkgId !== replacedDepPath) {
        candidate.attr = { pkgId };
      }
      if (snapshot.transitivePeerDependencies) {
        candidate.attr = {
          ...candidate.attr,
          transitivePeerDependencies: snapshot.transitivePeerDependencies,
        };
      }
      edge = candidate.neighbours.length > 0 || candidate.id !== pkgId ? candidate : null;
      edgesCache?.set(snapshot, { depPath, edge });
    }
    if (edge) {
      edges.push(edge);
    }
  }
  for (const dep of directDependencies) {
    dep.id = replaceFileVersion(dep.id);
  }
  edges.push({
    id: DependenciesGraph.ROOT_EDGE_ID,
    neighbours: directDependencies,
  });
  return edges;
}

function extractDependenciesFromSnapshot(
  snapshot: any,
  replaceFileVersion: (s: string) => string
): DependencyNeighbour[] {
  const dependencies: DependencyNeighbour[] = [];

  for (const { depTypeField, optional } of [
    { depTypeField: 'dependencies', optional: false },
    { depTypeField: 'optionalDependencies', optional: true },
  ]) {
    for (const [name, ref] of Object.entries((snapshot[depTypeField] ?? {}) as Record<string, string>)) {
      const subDepPath = dp.refToRelative(ref, name);
      if (subDepPath != null) {
        dependencies.push({ id: replaceFileVersion(subDepPath), optional });
      }
    }
  }

  return dependencies;
}

function buildPackages(
  lockfile: BitLockfileFile,
  {
    componentIdByPkgName,
    replaceFileVersion,
    packagesCache,
  }: {
    componentIdByPkgName: ComponentIdByPkgName;
    replaceFileVersion: (s: string) => string;
    packagesCache?: LockfileToGraphCache['packages'];
  }
): PackagesMap {
  const depsRequiringBuild = lockfile.bit?.depsRequiringBuild;
  const depsRequiringBuildSet = depsRequiringBuild ? new Set(depsRequiringBuild) : undefined;
  const packages: PackagesMap = new Map();
  for (const [pkgId, pkg] of Object.entries(lockfile.packages ?? {})) {
    const cached = packagesCache?.get(pkg);
    if (cached && cached.pkgId === pkgId) {
      packages.set(cached.replacedPkgId, cached.graphPkg);
      continue;
    }
    const graphPkg = pick(pkg, [
      'bundledDependencies',
      'cpu',
      'deprecated',
      'engines',
      'hasBin',
      'libc',
      'name',
      'os',
      'peerDependencies',
      'peerDependenciesMeta',
      'resolution',
      'version',
    ]) as any;
    if (graphPkg.resolution.type === 'directory') {
      delete graphPkg.resolution;
    }
    const replacedPkgId = replaceFileVersion(pkgId);
    const parsed = dp.parse(replacedPkgId);
    if (parsed.name && componentIdByPkgName.has(parsed.name)) {
      const compId = componentIdByPkgName.get(parsed.name)!;
      graphPkg.component = {
        name: compId.fullName,
        scope: compId.scope,
      };
    }
    if (depsRequiringBuildSet?.has(pkgId)) {
      graphPkg.requiresBuild = true;
    }
    packagesCache?.set(pkg, { pkgId, replacedPkgId, graphPkg });
    packages.set(replacedPkgId, graphPkg);
  }
  return packages;
}

export function createFileVersionReplacer(componentIdByPkgName: ComponentIdByPkgName): (s: string) => string {
  if (componentIdByPkgName.size === 0) return (s) => s;

  const replacements = new Map<string, string>();
  const escapedNames: string[] = [];
  for (const [pkgName, componentId] of componentIdByPkgName.entries()) {
    replacements.set(pkgName, `${pkgName}@${snapToSemver(componentId.version)}`);
    escapedNames.push(pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  const pattern = new RegExp(`(${escapedNames.join('|')})@file:[^'"(]+`, 'g');

  return (s: string) => {
    if (!s.includes('@file:')) return s;
    return s.replace(pattern, (_, name) => replacements.get(name)!);
  };
}

/**
 * Narrow a lockfile in-memory to the transitive closure of what `importerIds`
 * reaches, without crossing the N-API boundary or cloning the full lockfile.
 */
export function filterLockfileByImporters(
  lockfile: BitLockfileFile,
  importerIds: string[],
  importersOverride?: Record<string, LockfileFileProjectSnapshot>
): BitLockfileFile {
  ensureInitialized();
  const getImporter = (id: string) => importersOverride?.[id] ?? lockfile.importers?.[id];
  const reachablePackages = new Set<string>();
  const reachableSnapshots = new Set<string>();
  const stack: string[] = [];

  const visit = (depPath: string) => {
    stack.push(depPath);
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachableSnapshots.has(current)) continue;
      const pkgId = dp.removeSuffix(current);
      if (lockfile.packages?.[pkgId] != null) {
        reachablePackages.add(pkgId);
      }
      const snapshot = lockfile.snapshots?.[current];
      if (!snapshot) continue;
      reachableSnapshots.add(current);
      for (const depType of ['dependencies', 'optionalDependencies'] as const) {
        for (const [name, ref] of Object.entries(snapshot[depType] ?? {}) as Array<[string, string]>) {
          const subDepPath = dp.refToRelative(ref, name);
          if (subDepPath != null) {
            stack.push(subDepPath);
          }
        }
      }
    }
  };

  for (const importerId of importerIds) {
    const importer = getImporter(importerId);
    if (!importer) continue;
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      for (const [name, dep] of Object.entries(importer[depType] ?? {}) as Array<[string, { version?: string }]>) {
        if (!dep?.version) continue;
        const depPath = dp.refToRelative(dep.version, name);
        if (depPath != null) {
          visit(depPath);
        }
      }
    }
  }

  const filteredPackages: NonNullable<BitLockfileFile['packages']> = {};
  for (const pkgId of reachablePackages) {
    filteredPackages[pkgId] = lockfile.packages![pkgId];
  }

  const filteredSnapshots: NonNullable<BitLockfileFile['snapshots']> = {};
  for (const depPath of reachableSnapshots) {
    filteredSnapshots[depPath] = lockfile.snapshots![depPath];
  }

  const filteredImporters: NonNullable<BitLockfileFile['importers']> = {};
  for (const importerId of importerIds) {
    const importer = getImporter(importerId);
    if (importer != null) {
      filteredImporters[importerId] = importer;
    }
  }

  return {
    ...lockfile,
    importers: filteredImporters,
    packages: filteredPackages,
    snapshots: filteredSnapshots,
  };
}

export async function convertGraphToLockfile(
  _graph: DependenciesGraph,
  {
    manifests,
    rootDir,
    resolve,
    onComponentPkgDropped,
  }: {
    manifests: Record<string, ProjectManifest>;
    rootDir: string;
    resolve: ResolveFunction;
    /** Called for each workspace-component package the lockfile leaves out, with why. */
    onComponentPkgDropped?: (pkgId: string, reason: string) => void;
  }
): Promise<BitLockfileFile> {
  await init();
  const graphString = _graph.serialize();
  const graph = DependenciesGraph.deserialize(graphString)!;
  dropOrphanFilePkgs(graph);
  dropOrphanNeighbours(graph);
  const packages = {};
  const snapshots = {};
  const allEdgeIds = new Set(graph.edges.map(({ id }) => id));

  for (const edge of graph.edges) {
    if (edge.id === DependenciesGraph.ROOT_EDGE_ID) continue;
    const pkgId = edge.attr?.pkgId ?? edge.id;
    snapshots[edge.id] = {};
    packages[pkgId] = {};
    const [optionalDeps, prodDeps] = partition(edge.neighbours, (dep) => dep.optional);
    if (prodDeps.length) {
      snapshots[edge.id].dependencies = convertToDeps(prodDeps);
    }
    if (optionalDeps.length) {
      snapshots[edge.id].optionalDependencies = convertToDeps(optionalDeps);
    }
    const graphPkg = graph.packages.get(pkgId);
    if (graphPkg != null) {
      Object.assign(packages[pkgId], convertGraphPackageToLockfilePackage(graphPkg));
    }
  }
  for (const [pkgId, graphPkg] of graph.packages.entries()) {
    if (packages[pkgId] == null) {
      packages[pkgId] = convertGraphPackageToLockfilePackage(graphPkg);
      snapshots[pkgId] = {};
    }
  }
  const depsRequiringBuild: string[] = [];
  for (const [pkgId, { requiresBuild }] of graph.packages.entries()) {
    if (requiresBuild) {
      depsRequiringBuild.push(pkgId);
    }
  }
  depsRequiringBuild.sort();
  const lockfile: BitLockfileFile & Required<Pick<BitLockfileFile, 'packages'>> = {
    lockfileVersion: '9.0',
    packages,
    snapshots,
    importers: {},
    bit: { depsRequiringBuild },
  };
  // Carry the readPackage hooks checksum the graph was resolved with, if any,
  // so pnpm accepts the restored resolution only while the hooks are the same.
  // Bit passes no hooks anymore, and the graph model translates the checksum of
  // its last hooks into the overrides that replaced them.
  //
  // A graph saved before the graph recorded the checksum has none, and gets
  // none here: pnpm then resolves its dependencies again. Stamping the current
  // checksum on it would be wrong, because the hooks changed what they do to
  // dependency manifests while such graphs were being saved (e.g. stripping
  // `@teambit/harmony` from every dependency was added after graphs started
  // being stored), so an old graph may hold resolutions the current hooks
  // would not produce.
  if (graph.pnpmfileChecksum != null) {
    lockfile.pnpmfileChecksum = graph.pnpmfileChecksum;
  }
  // Carry the resolution settings the graph was resolved under as well. pnpm
  // compares them with the install's settings, and a lockfile without them
  // reads as resolved with dedupePeers and injectWorkspacePackages off, which
  // Bit's installs never match, so every restored lockfile was resolved again.
  if (graph.lockfileSettings != null) {
    lockfile.settings = graph.lockfileSettings;
  }
  // And the overrides, which pnpm compares with the install's the same way.
  if (graph.overrides != null) {
    lockfile.overrides = graph.overrides;
  }
  const rootEdge = graph.findRootEdge();
  if (rootEdge) {
    const workspaceVersions = new Map(
      Array.from(workspaceComponentDirs(manifests, rootDir).keys()).map((pkgId) => {
        const parsed = dp.parse(pkgId);
        return [parsed.name!, parsed.version!] as [string, string];
      })
    );
    for (const [projectDir, manifest] of Object.entries(manifests)) {
      const projectId = getLockfileImporterId(rootDir, projectDir);
      lockfile.importers![projectId] = {
        dependencies: {},
        devDependencies: {},
        optionalDependencies: {},
      };
      for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, specifier] of Object.entries(manifest[depType] ?? {}) as Array<[string, string]>) {
          if (specifier.startsWith('link:')) {
            const version = `link:${normalizePath(path.relative(projectDir, specifier.substring(5)))}`;
            lockfile.importers![projectId][depType][name] = { version, specifier };
          } else {
            const edgeId = findImporterDepPath(graph, rootEdge, name, specifier, workspaceVersions);
            if (edgeId) {
              const parsed = dp.parse(edgeId);
              const ref = depPathToRef(parsed);
              lockfile.importers![projectId][depType][name] = { version: ref, specifier };
            }
          }
        }
      }
    }
  }
  dedupeSnapshotDepsToRootManifest(lockfile, manifests[rootDir]);
  linkWorkspaceComponents(lockfile, manifests, rootDir);
  // Only what the importers reach is worth resolving: a graph holds entries
  // no manifest here declares (an attached extension's dev dependencies, for
  // one), and a registry lookup for them would be wasted or could fail.
  dropUnreachableLockfileEntries(lockfile);
  const pkgsToResolve = getPkgsToResolve(lockfile, manifests);
  const failedWorkspaceComponentPkgs = new Set<string>();
  await Promise.all(
    pkgsToResolve.map(async (pkgToResolve) => {
      if (lockfile.packages[pkgToResolve.pkgId].resolution == null) {
        let resolveResult;
        try {
          resolveResult = await resolve(
            {
              alias: pkgToResolve.name,
              bareSpecifier: pkgToResolve.version,
            },
            {
              lockfileDir: rootDir,
              projectDir: rootDir,
              preferredVersions: {},
            }
          );
        } catch (err) {
          // A workspace-component package with a missing resolution whose
          // snap-version was never published surfaces here as pnpm's
          // ERR_PNPM_NO_MATCHING_VERSION. The graph itself is unusable for
          // this pkgId, but pnpm can re-resolve the dep from the installing
          // manifest's specifier — so scrub the pkgId from the generated
          // lockfile and continue. Re-throw every other error code (network,
          // auth, 5xx, even FETCH_404 since some registries return 404 on
          // auth failures) so real install failures aren't silently masked.
          if (
            (err as { code?: string }).code === 'ERR_PNPM_NO_MATCHING_VERSION' &&
            graph.packages.get(pkgToResolve.pkgId)?.component != null
          ) {
            failedWorkspaceComponentPkgs.add(pkgToResolve.pkgId);
            onComponentPkgDropped?.(pkgToResolve.pkgId, `the registry has no such version: ${(err as Error).message}`);
            return;
          }
          throw err;
        }
        const integrity = resolvedIntegrity(resolveResult);
        if (integrity) {
          lockfile.packages[pkgToResolve.pkgId].resolution = { integrity };
        }
      }
    })
  );
  // A workspace-component snap can still be missing a resolution here even
  // when resolve() never threw ERR_PNPM_NO_MATCHING_VERSION. Its directory
  // resolution was stripped at graph-build time (see buildPackages), and the
  // resolve pass above leaves it null in two cases the throw-handler doesn't
  // see: getPkgsToResolve skips any pkgId whose name+version matches a
  // manifest in the sign/capsule set (so the resolver is never called for a
  // component that is itself a seeder being signed), and a resolver can also
  // return a resolution that carries no integrity. Either way the snap-version
  // was never published, so it can't carry a valid lockfile entry. Sweep every
  // still-resolution-less workspace-component pkg into the scrub set so pnpm
  // re-resolves the dep from the installing manifest's specifier (linking the
  // workspace component) instead of failing validation and aborting the whole
  // install. Non-component registry pkgs with no resolution are left to fail
  // validation below — that path means the graph itself is genuinely broken.
  for (const [pkgId, pkg] of Object.entries(lockfile.packages)) {
    if (
      (pkg.resolution == null || Object.keys(pkg.resolution).length === 0) &&
      graph.packages.get(pkgId)?.component != null
    ) {
      if (!failedWorkspaceComponentPkgs.has(pkgId)) {
        onComponentPkgDropped?.(pkgId, 'its resolution has no integrity');
      }
      failedWorkspaceComponentPkgs.add(pkgId);
    }
  }
  if (failedWorkspaceComponentPkgs.size > 0) {
    scrubPkgsFromLockfile(lockfile, failedWorkspaceComponentPkgs);
  }
  dropUnreachableLockfileEntries(lockfile);
  markOptionalOnlyEntries(lockfile);
  // Validate the generated lockfile
  for (const [depPath, pkg] of Object.entries(lockfile.packages)) {
    if (pkg.resolution == null || Object.keys(pkg.resolution).length === 0) {
      throw new BitError(
        `Failed to generate a valid lockfile. The "packages['${depPath}']" entry doesn't have a "resolution" field.`
      );
    }
  }
  return lockfile;

  function convertToDeps(neighbours: DependencyNeighbour[]) {
    const deps = {};
    for (const { id } of neighbours) {
      const parsed = dp.parse(id);
      deps[parsed.name!] = depPathToRef(parsed);
      if (!allEdgeIds.has(id)) {
        snapshots[id] = {};
        packages[id] = convertGraphPackageToLockfilePackage(graph.packages.get(id)!);
      }
    }
    return deps;
  }
}

/**
 * The dep path a restored importer entry for `name@specifier` points at: the
 * root edge neighbour the manifest's dependency matches, or, when the manifest
 * asks for a version the graph holds only deeper in the tree (an env peer a
 * capsule manifest took from the graph), the snapshot of that version,
 * preferring the peer variant the component's own dependencies were resolved
 * against. Nothing when the graph holds no such version.
 */
function findImporterDepPath(
  graph: DependenciesGraph,
  rootEdge: DependencyEdge,
  name: string,
  specifier: string,
  workspaceVersions: Map<string, string>
): string | undefined {
  const sameName = rootEdge.neighbours.filter((directDep) => directDep.name === name);
  // A merged graph keeps one neighbour per distinct specifier of a package,
  // so the one recorded for this very specifier or version comes first; a
  // range is matched only when none was, and among several resolutions that
  // satisfy it the highest version, which is what a resolution would pick.
  const recorded =
    sameName.find((directDep) => directDep.specifier === specifier) ??
    sameName.find((directDep) => dp.removeSuffix(directDep.id) === `${name}@${specifier}`);
  if (recorded) return recorded.id;
  const satisfying = sameName.filter((directDep) =>
    specifierMatchesDirectDep(name, specifier, directDep, workspaceVersions)
  );
  if (satisfying.length > 0) {
    return satisfying.reduce((highest, directDep) =>
      semver.gt(dp.parse(directDep.id).version!, dp.parse(highest.id).version!) ? directDep : highest
    ).id;
  }
  const pkgId = `${name}@${specifier}`;
  const candidates = graph.edges
    .filter(
      (edge) => edge.id !== DependenciesGraph.ROOT_EDGE_ID && (edge.attr?.pkgId ?? dp.removeSuffix(edge.id)) === pkgId
    )
    .map((edge) => edge.id);
  if (candidates.length === 0) return graph.packages.has(pkgId) ? pkgId : undefined;
  const peerIdsOfDirectDeps = new Set<string>();
  const stack = rootEdge.neighbours.map(({ id }) => id);
  while (stack.length > 0) {
    for (const peerId of splitDependenciesGraphPeerIds(stack.pop()!)) {
      peerIdsOfDirectDeps.add(peerId);
      stack.push(peerId);
    }
  }
  return candidates.find((id) => peerIdsOfDirectDeps.has(id)) ?? candidates[0];
}

/**
 * Whether the manifest's `specifier` for `name`, which no direct dependency
 * was recorded for, is satisfied by the direct dependency the graph recorded
 * under another specifier: a workspace reference the graph resolved to the
 * version of the workspace component of that name, or a range the resolved
 * version satisfies, read the way pnpm reads ranges, so a prerelease
 * satisfies only a range that names one.
 */
function specifierMatchesDirectDep(
  name: string,
  specifier: string,
  directDep: DependencyNeighbour,
  workspaceVersions: Map<string, string>
): boolean {
  const { version } = dp.parse(directDep.id);
  if (version == null) return false;
  if (specifier.startsWith('workspace:')) {
    // The entry becomes the workspace component's `file:` record, so only the
    // version the workspace holds can stand for it, and the range, when the
    // reference carries one, has to accept that version.
    if (workspaceVersions.get(name) !== version) return false;
    const range = specifier.slice('workspace:'.length);
    if (range === '' || range === '*' || range === '^' || range === '~') return true;
    return semver.validRange(range) != null && semver.satisfies(version, range);
  }
  return semver.validRange(specifier) != null && semver.satisfies(version, specifier);
}

interface PkgToResolve {
  name: string;
  version: string;
  pkgId: string;
}

function getPkgsToResolve(lockfile: BitLockfileFile, manifests: Record<string, ProjectManifest>): PkgToResolve[] {
  const pkgsToResolve: PkgToResolve[] = [];
  const pkgsInTheWorkspaces = new Map<string, string>();
  for (const { name, version } of Object.values(manifests)) {
    if (name && version) {
      pkgsInTheWorkspaces.set(name, version);
    }
  }
  for (const [pkgId, pkg] of Object.entries(lockfile.packages ?? {})) {
    if (pkg.resolution == null || ('type' in pkg.resolution && pkg.resolution.type === 'directory')) {
      const parsed = dp.parse(pkgId);
      if (
        parsed.name &&
        parsed.version &&
        (!pkgsInTheWorkspaces.has(parsed.name) || pkgsInTheWorkspaces.get(parsed.name) !== parsed.version)
      ) {
        pkgsToResolve.push({
          name: parsed.name,
          version: parsed.version,
          pkgId,
        });
      }
    }
  }
  return pkgsToResolve;
}

function dropUnreachableLockfileEntries(lockfile: BitLockfileFile): void {
  const reachablePackages = new Set<string>();
  const reachableSnapshots = new Set<string>();
  // An explicit stack: deep dependency chains would overflow the call
  // stack with a recursive walk.
  const stack: string[] = [];
  const visit = (depPath: string) => {
    stack.push(depPath);
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachableSnapshots.has(current)) continue;
      reachableSnapshots.add(current);
      reachablePackages.add(dp.removeSuffix(current));
      const snapshot = lockfile.snapshots?.[current];
      if (!snapshot) continue;
      for (const depType of ['dependencies', 'optionalDependencies'] as const) {
        for (const [name, ref] of Object.entries(snapshot[depType] ?? {})) {
          const subDepPath = refToDepPath(ref, name);
          if (subDepPath != null) stack.push(subDepPath);
        }
      }
    }
  };
  for (const importer of Object.values(lockfile.importers ?? {})) {
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      for (const [name, { version }] of Object.entries(importer[depType] ?? {})) {
        const depPath = refToDepPath(version, name);
        if (depPath != null) visit(depPath);
      }
    }
  }
  for (const pkgId of Object.keys(lockfile.packages ?? {})) {
    if (!reachablePackages.has(pkgId)) {
      delete lockfile.packages![pkgId];
    }
  }
  for (const depPath of Object.keys(lockfile.snapshots ?? {})) {
    if (!reachableSnapshots.has(depPath)) {
      delete lockfile.snapshots![depPath];
    }
  }
  if (lockfile.bit?.depsRequiringBuild) {
    lockfile.bit.depsRequiringBuild = lockfile.bit.depsRequiringBuild.filter((depPath) =>
      reachablePackages.has(dp.removeSuffix(depPath))
    );
  }
}

/**
 * The workspace components among `manifests`, keyed by the `name@version`
 * id the graph records them under, with the lockfile-relative directory pnpm
 * records them at. The root project is not a component.
 */
function workspaceComponentDirs(manifests: Record<string, ProjectManifest>, rootDir: string): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const [projectDir, { name, version }] of Object.entries(manifests)) {
    if (!name || !version) continue;
    const relativeDir = getLockfileImporterId(rootDir, projectDir);
    if (relativeDir === '.') continue;
    dirs.set(`${name}@${snapToSemver(version)}`, relativeDir);
  }
  return dirs;
}

/**
 * The inverse of `createFileVersionReplacer`: rewrites every `name@version`
 * of a workspace component in `dirs`, wherever it stands in a package id, a
 * dep path or a peer suffix, to the `name@file:<dir>` pnpm records for it.
 */
function createWorkspaceComponentReplacer(dirs: Map<string, string>): (s: string) => string {
  if (dirs.size === 0) return (s) => s;
  const ids = Array.from(dirs.keys()).map(escapeRegExp);
  // An id starts a dep path or a peer suffix segment, or follows the alias in
  // an aliased dep path, and ends where its own peer suffix or the enclosing
  // segment does.
  const pattern = new RegExp(`(?<=^|[(@])(${ids.join('|')})(?=[()]|$)`, 'g');
  return (s: string) => s.replace(pattern, (id) => `${id.slice(0, id.lastIndexOf('@'))}@file:${dirs.get(id)!}`);
}

/**
 * Record the workspace components the graph resolved to, at the version the
 * workspace holds them, the way pnpm does: as `file:` directory packages, with
 * the graph's resolution of their dependencies as their snapshot. pnpm links
 * every dependency on such a version to the workspace component
 * (`linkWorkspacePackages: deep`), transitive ones included, so a registry
 * entry for it would only be resolved again, and pnpm accepts the snapshot
 * while the component's manifest still declares the dependencies it records.
 * Other versions of the same component stay registry packages.
 */
function linkWorkspaceComponents(
  lockfile: BitLockfileFile & Required<Pick<BitLockfileFile, 'packages'>>,
  manifests: Record<string, ProjectManifest>,
  rootDir: string
): void {
  const dirs = workspaceComponentDirs(manifests, rootDir);
  if (dirs.size === 0) return;
  const replace = createWorkspaceComponentReplacer(dirs);
  const replaceRef = (name: string, ref: string) =>
    ref.startsWith('link:') ? ref : replace(`${name}@${ref}`).slice(name.length + 1);
  const packages: NonNullable<BitLockfileFile['packages']> = {};
  for (const [pkgId, pkg] of Object.entries(lockfile.packages)) {
    const directory = dirs.get(pkgId);
    if (directory == null) {
      packages[pkgId] = pkg;
      continue;
    }
    // The id carries the name and the version, and the directory is the
    // resolution. The rest (peers, engines, bins, ...) describes the package
    // either way.
    packages[replace(pkgId)] = {
      ...omit(pkg, ['resolution', 'name', 'version']),
      resolution: { directory, type: 'directory' },
    };
  }
  lockfile.packages = packages;
  const snapshots: NonNullable<BitLockfileFile['snapshots']> = {};
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    for (const depType of ['dependencies', 'optionalDependencies'] as const) {
      const deps = snapshot[depType];
      if (!deps) continue;
      for (const [name, ref] of Object.entries(deps)) {
        deps[name] = replaceRef(name, ref);
      }
    }
    snapshots[replace(depPath)] = snapshot;
  }
  lockfile.snapshots = snapshots;
  for (const importer of Object.values(lockfile.importers ?? {})) {
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      for (const [name, dep] of Object.entries(importer[depType] ?? {})) {
        dep.version = replaceRef(name, dep.version);
      }
    }
  }
  if (lockfile.bit?.depsRequiringBuild) {
    lockfile.bit.depsRequiringBuild = lockfile.bit.depsRequiringBuild.map(replace);
  }
}

/**
 * The dep path a lockfile ref under `name` points at, or `undefined` for a
 * `link:` ref, which points at no snapshot. An aliased ref
 * (`real-name@1.0.0` under the alias) names the real package, and a `file:`
 * ref a workspace component's own snapshot.
 */
export function refToDepPath(ref: string, name: string): string | undefined {
  ensureInitialized();
  return dp.refToRelative(ref, name) ?? undefined;
}

/**
 * Set each snapshot's `optional` flag the way pnpm does: on when every path
 * from an importer to it goes through an `optionalDependencies` edge, off
 * otherwise. The graph does not record the flag, and an install that takes
 * the lockfile as it is relies on it: a package reached only optionally may
 * fail to build or to install, one reached otherwise may not.
 */
export function markOptionalOnlyEntries(lockfile: Pick<LockfileFile, 'importers' | 'snapshots'>): void {
  const snapshots = lockfile.snapshots ?? {};
  // Walk (dep path, reached optionally): `dependencies` edges keep the
  // context, `optionalDependencies` edges always enter it.
  const visited = new Set<string>();
  const reachedNonOptionally = new Set<string>();
  const reachedOptionally = new Set<string>();
  const queue: Array<[string, boolean]> = [];
  for (const importer of Object.values(lockfile.importers ?? {})) {
    for (const [depType, optional] of [
      ['dependencies', false],
      ['devDependencies', false],
      ['optionalDependencies', true],
    ] as const) {
      for (const [name, { version }] of Object.entries(importer[depType] ?? {})) {
        const depPath = refToDepPath(version, name);
        if (depPath != null) queue.push([depPath, optional]);
      }
    }
  }
  while (queue.length > 0) {
    const [depPath, optional] = queue.pop()!;
    const visitKey = `${optional ? 'o' : 'r'}:${depPath}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    (optional ? reachedOptionally : reachedNonOptionally).add(depPath);
    const snapshot = snapshots[depPath];
    if (!snapshot) continue;
    for (const [depType, edgeOptional] of [
      ['dependencies', optional],
      ['optionalDependencies', true],
    ] as const) {
      for (const [name, ref] of Object.entries(snapshot[depType] ?? {})) {
        const subDepPath = refToDepPath(ref, name);
        if (subDepPath != null) queue.push([subDepPath, edgeOptional]);
      }
    }
  }
  for (const [depPath, snapshot] of Object.entries(snapshots)) {
    if (reachedOptionally.has(depPath) && !reachedNonOptionally.has(depPath)) {
      snapshot.optional = true;
    } else {
      delete snapshot.optional;
    }
  }
}

function dedupeSnapshotDepsToRootManifest(lockfile: BitLockfileFile, rootManifest: ProjectManifest | undefined): void {
  const overridden = new Set(overriddenPackageNames(lockfile.overrides));
  const rootDeps = new Map(
    Object.entries(nonOptionalDependencies(rootManifest)).filter(([name]) => !overridden.has(name))
  );
  if (rootDeps.size === 0) return;
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const peers = new Set(Object.keys(lockfile.packages?.[dp.removeSuffix(depPath)]?.peerDependencies ?? {}));
    dropSnapshotDeps(
      snapshot,
      (name, ref) => rootDeps.has(name) && rootVersionWins(name, ref, rootDeps.get(name)!, peers.has(name))
    );
  }
}

function nonOptionalDependencies(manifest: ProjectManifest | undefined): Record<string, string> {
  return { ...manifest?.devDependencies, ...manifest?.dependencies };
}

function overriddenPackageNames(overrides: Record<string, string> | undefined): string[] {
  return parseOverrides(overrides ?? {}).map((override) => override.targetPkg.name);
}

function dropSnapshotDeps(
  snapshot: NonNullable<BitLockfileFile['snapshots']>[string],
  shouldDrop: (name: string, ref: string) => boolean
): void {
  for (const depType of ['dependencies', 'optionalDependencies'] as const) {
    const deps = snapshot[depType];
    if (!deps) continue;
    for (const [name, ref] of Object.entries(deps)) {
      if (shouldDrop(name, ref)) delete deps[name];
    }
  }
}

function rootVersionWins(name: string, ref: string, rootSpecifier: string, isPeer: boolean): boolean {
  const lockedVersion = dp.parse(`${name}@${ref}`).version;
  if (lockedVersion == null) return false;
  const rootVersion = semver.valid(rootSpecifier);
  if (rootVersion != null) return lockedVersion !== rootVersion;
  return isPeer;
}

function depPathToRef(depPath: Dp.DependencyPath): string {
  return `${depPath.version}${depPath.patchHash ?? ''}${depPath.peerDepGraphHash ?? ''}`;
}

function isFilePkgId(pkgId: string): boolean {
  return dp.parse(pkgId).nonSemverVersion?.startsWith('file:') ?? false;
}

/**
 * Strip orphan "@file:" entries from the graph (mutates in place).
 *
 * The "@file:" pkgIds in pnpm's lockfile are workspace components linked as
 * directory deps. buildPackages is supposed to rewrite them to
 * "name@<semverVersion>" via componentIdByPkgName, but if a name is missing
 * from that map (older bit, partial isolation, a component renamed/removed
 * between install and tag) the orphan leaks through with its resolution
 * stripped (directory type). We can't recover an integrity for it later —
 * getPkgsToResolve won't try because dp.parse shoves "file:..." into
 * nonSemverVersion, leaving parsed.version undefined, and at install time
 * the component is either a workspace project pnpm wires through importers
 * (so it doesn't belong in the packages map) or no longer in the workspace
 * at all. Either way the orphan entry is unusable, so drop it both at graph
 * creation (don't persist broken graphs) and at lockfile generation
 * (recover graphs already saved in the model).
 */
function dropOrphanFilePkgs(graph: DependenciesGraph): void {
  const orphanPkgIds = new Set<string>();
  for (const pkgId of graph.packages.keys()) {
    if (isFilePkgId(pkgId)) {
      orphanPkgIds.add(pkgId);
    }
  }
  for (const edge of graph.edges) {
    const pkgId = edge.attr?.pkgId ?? edge.id;
    if (isFilePkgId(pkgId) || isFilePkgId(edge.id)) {
      orphanPkgIds.add(pkgId);
      orphanPkgIds.add(edge.id);
    }
  }
  if (orphanPkgIds.size === 0) return;
  for (const id of orphanPkgIds) {
    graph.packages.delete(id);
  }
  graph.edges = graph.edges
    .filter((edge) => !orphanPkgIds.has(edge.id) && !orphanPkgIds.has(edge.attr?.pkgId ?? edge.id))
    .map((edge) => {
      if (!edge.neighbours.some((n) => orphanPkgIds.has(n.id))) return edge;
      return {
        ...edge,
        neighbours: edge.neighbours.filter((n) => !orphanPkgIds.has(n.id)),
      };
    });
}

/**
 * Drop neighbours that reference a pkgId with no edge AND no packages entry.
 *
 * Recovers graphs saved by bits older than #10361 (the back-edge fix). Those
 * older bits, when snapping a component with a circular workspace dep, deleted
 * the component's own snapshot/package entry but left back-references to it on
 * other snapshots intact. The orphan neighbour now has no edge (its snapshot
 * was removed) and no packages entry (its package was removed), so the loop
 * below would synthesise an empty packages entry and getPkgsToResolve would
 * ask the registry for a workspace snap-version that was never published —
 * surfacing as ERR_PNPM_NO_MATCHING_VERSION at install time. Scrubbing the
 * dangling neighbour here means already-saved broken graphs install cleanly
 * without requiring the affected component to be re-snapped on a newer client.
 */
function dropOrphanNeighbours(graph: DependenciesGraph): void {
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const isOrphan = (n: DependencyNeighbour): boolean =>
    !edgeIds.has(n.id) && !graph.packages.has(dp.removeSuffix(n.id));
  graph.edges = graph.edges.map((edge) => {
    if (!edge.neighbours.some(isOrphan)) return edge;
    return {
      ...edge,
      neighbours: edge.neighbours.filter((n) => !isOrphan(n)),
    };
  });
}

/**
 * Remove the given pkgIds (and everything that references them) from a
 * lockfile in place. Used when a workspace-component snap-version baked into
 * the graph turns out to be unpublishable at install time — leaving it in the
 * lockfile would fail validation and abort the whole install. Stripping it
 * means pnpm falls back to resolving the dep from the installing manifest's
 * specifier, which is the same path as a graph-less install for that one dep.
 */
function scrubPkgsFromLockfile(lockfile: BitLockfileFile, pkgIds: Set<string>): void {
  const matches = (depPath: string): boolean => pkgIds.has(dp.removeSuffix(depPath));
  for (const pkgId of pkgIds) {
    delete lockfile.packages![pkgId];
  }
  for (const depPath of Object.keys(lockfile.snapshots ?? {})) {
    if (matches(depPath)) {
      delete lockfile.snapshots![depPath];
    }
  }
  for (const snapshot of Object.values(lockfile.snapshots ?? {})) {
    for (const depType of ['dependencies', 'optionalDependencies'] as const) {
      const deps = snapshot[depType];
      if (!deps) continue;
      for (const [name, ref] of Object.entries(deps)) {
        if (matches(`${name}@${ref}`)) {
          delete deps[name];
        }
      }
      if (Object.keys(deps).length === 0) delete snapshot[depType];
    }
  }
  for (const importer of Object.values(lockfile.importers ?? {})) {
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      const deps = importer[depType];
      if (!deps) continue;
      for (const [name, { version }] of Object.entries(deps)) {
        if (version.startsWith('link:') || version.startsWith('file:')) continue;
        if (matches(`${name}@${version}`)) {
          delete deps[name];
        }
      }
    }
  }
}

function convertGraphPackageToLockfilePackage(pkgAttr: PackageAttributes) {
  return pick(pkgAttr, [
    'bundledDependencies',
    'cpu',
    'deprecated',
    'engines',
    'hasBin',
    'libc',
    'name',
    'os',
    'peerDependencies',
    'peerDependenciesMeta',
    'resolution',
    'version',
  ]);
}
