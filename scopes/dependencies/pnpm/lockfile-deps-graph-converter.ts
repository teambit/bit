import path from 'path';
import { type ProjectManifest } from '@pnpm/types';
import { type LockfileFileProjectResolvedDependencies } from '@pnpm/lockfile.types';
import { type ResolveFunction } from '@pnpm/client';
import * as dp from '@pnpm/dependency-path';
import { pick, partition } from 'lodash';
import { BitError } from '@teambit/bit-error';
import { snapToSemver } from '@teambit/component-package-version';
import {
  DependenciesGraph,
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
import { getLockfileImporterId } from '@pnpm/lockfile.fs';
import normalizePath from 'normalize-path';
import { type BitLockfileFile } from './lynx';

function convertLockfileToGraphFromCapsule(
  lockfile: BitLockfileFile,
  {
    componentRelativeDir,
    componentIdByPkgName,
  }: Pick<CalcDepsGraphOptions & CalcDepsGraphForComponentOptions, 'componentRelativeDir' | 'componentIdByPkgName'>
): DependenciesGraph {
  const componentImporter = lockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const, 'devDependencies' as const]) {
    if (componentImporter[depType] != null) {
      const lifecycle = depType === 'devDependencies' ? 'dev' : 'runtime';
      const optional = depType === 'optionalDependencies';
      directDependencies.push(...importerDepsToNeighbours(componentImporter[depType]!, lifecycle, optional));
    }
  }
  return _convertLockfileToGraph(lockfile, { componentIdByPkgName, directDependencies });
}

function importerDepsToNeighbours(
  importerDependencies: LockfileFileProjectResolvedDependencies,
  lifecycle: 'dev' | 'runtime',
  optional: boolean
): DependencyNeighbour[] {
  const neighbours: DependencyNeighbour[] = [];
  for (const [name, { version, specifier }] of Object.entries(importerDependencies) as any) {
    const id = dp.refToRelative(version, name)!;
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
  }: Omit<CalcDepsGraphOptions & CalcDepsGraphForComponentOptions, 'rootDir' | 'components' | 'component'>
): DependenciesGraph {
  if (componentRootDir == null || pkgName == null) {
    return convertLockfileToGraphFromCapsule(lockfile, { componentRelativeDir, componentIdByPkgName });
  }
  const componentDevImporter = lockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  if (componentDevImporter.devDependencies != null) {
    directDependencies.push(...importerDepsToNeighbours(componentDevImporter.devDependencies, 'dev', false));
  }
  const lockedPkgDepPath = `${pkgName}@${lockfile.importers![componentRootDir].dependencies![pkgName].version}`;
  const lockedPkg = lockfile.snapshots![lockedPkgDepPath];
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const]) {
    const optional = depType === 'optionalDependencies';
    for (const [name, version] of Object.entries(lockedPkg[depType] ?? {})) {
      const id = dp.refToRelative(version, name)!;
      directDependencies.push({
        name,
        specifier: componentDevImporter[depType]?.[name]?.specifier ?? '*',
        id,
        lifecycle: 'runtime',
        optional,
      });
    }
  }
  delete lockfile.snapshots![lockedPkgDepPath];
  delete lockfile.packages![dp.removeSuffix(lockedPkgDepPath)];
  // Scrub back-edges from a circular workspace dep (another workspace
  // component depending on the one we're processing). Otherwise the
  // back-edge survives buildEdges but its target — the just-deleted
  // pkgId — has no entry in buildPackages, leaving a dangling neighbour.
  // convertGraphToLockfile would later materialise that neighbour as an
  // empty packages entry and ask the registry for the workspace
  // snap-version, which may never have been published.
  const lockedFileVersion = lockfile.importers![componentRootDir].dependencies![pkgName].version;
  for (const snapshot of Object.values(lockfile.snapshots ?? {})) {
    for (const depType of ['dependencies', 'optionalDependencies'] as const) {
      const deps = snapshot[depType];
      if (deps?.[pkgName] === lockedFileVersion) {
        delete deps[pkgName];
        if (Object.keys(deps).length === 0) delete snapshot[depType];
      }
    }
  }
  return _convertLockfileToGraph(lockfile, { componentIdByPkgName, directDependencies });
}

function _convertLockfileToGraph(
  lockfile: BitLockfileFile,
  {
    componentIdByPkgName,
    directDependencies,
  }: {
    componentIdByPkgName: ComponentIdByPkgName;
    directDependencies: DependencyNeighbour[];
  }
): DependenciesGraph {
  const graph = new DependenciesGraph({
    edges: buildEdges(lockfile, { directDependencies, componentIdByPkgName }),
    packages: buildPackages(lockfile, { componentIdByPkgName }),
  });
  dropOrphanFilePkgs(graph);
  return graph;
}

function buildEdges(
  lockfile: BitLockfileFile,
  {
    directDependencies,
    componentIdByPkgName,
  }: {
    directDependencies: DependencyNeighbour[];
    componentIdByPkgName: ComponentIdByPkgName;
  }
): DependencyEdge[] {
  const replaceFileVersion = createFileVersionReplacer(componentIdByPkgName);
  const edges: DependencyEdge[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const neighbours = extractDependenciesFromSnapshot(snapshot, replaceFileVersion);
    const replacedDepPath = replaceFileVersion(depPath);
    const edge: DependencyEdge = {
      id: replacedDepPath,
      neighbours,
    };
    const pkgId = dp.removeSuffix(replacedDepPath);
    if (pkgId !== replacedDepPath) {
      edge.attr = { pkgId };
    }
    if (snapshot.transitivePeerDependencies) {
      edge.attr = {
        ...edge.attr,
        transitivePeerDependencies: snapshot.transitivePeerDependencies,
      };
    }
    if (edge.neighbours.length > 0 || edge.id !== pkgId) {
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
  { componentIdByPkgName }: { componentIdByPkgName: ComponentIdByPkgName }
): PackagesMap {
  const replaceFileVersion = createFileVersionReplacer(componentIdByPkgName);
  const depsRequiringBuild = lockfile.bit?.depsRequiringBuild;
  const depsRequiringBuildSet = depsRequiringBuild ? new Set(depsRequiringBuild) : undefined;
  const packages: PackagesMap = new Map();
  for (const [pkgId, pkg] of Object.entries(lockfile.packages ?? {})) {
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
    packages.set(replacedPkgId, graphPkg);
  }
  return packages;
}

function createFileVersionReplacer(componentIdByPkgName: ComponentIdByPkgName): (s: string) => string {
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

export async function convertGraphToLockfile(
  _graph: DependenciesGraph,
  {
    manifests,
    rootDir,
    resolve,
  }: {
    manifests: Record<string, ProjectManifest>;
    rootDir: string;
    resolve: ResolveFunction;
  }
): Promise<BitLockfileFile> {
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
  const rootEdge = graph.findRootEdge();
  if (rootEdge) {
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
            const edgeId = rootEdge.neighbours.find(
              (directDep) =>
                directDep.name === name &&
                (directDep.specifier === specifier || dp.removeSuffix(directDep.id) === `${name}@${specifier}`)
            )?.id;
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
              lockfileDir: '',
              projectDir: '',
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
            return;
          }
          throw err;
        }
        const { resolution } = resolveResult;
        if ('integrity' in resolution && resolution.integrity) {
          lockfile.packages[pkgToResolve.pkgId].resolution = {
            integrity: resolution.integrity,
          };
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
      failedWorkspaceComponentPkgs.add(pkgId);
    }
  }
  if (failedWorkspaceComponentPkgs.size > 0) {
    scrubPkgsFromLockfile(lockfile, failedWorkspaceComponentPkgs);
  }
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

function depPathToRef(depPath: dp.DependencyPath): string {
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
