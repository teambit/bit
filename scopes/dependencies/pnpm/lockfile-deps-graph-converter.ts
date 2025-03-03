import path from 'path';
import { type ProjectManifest, type Registries } from '@pnpm/types';
import { type LockfileFileV9, type InlineSpecifiersResolvedDependencies } from '@pnpm/lockfile.types';
import { type ResolveFunction } from '@pnpm/client';
import * as dp from '@pnpm/dependency-path';
import { pickRegistryForPackage } from '@pnpm/pick-registry-for-package';
import { pick, partition } from 'lodash';
import { snapToSemver } from '@teambit/component-package-version';
import {
  DependenciesGraph,
  type PackagesMap,
  type PackageAttributes,
  type DependencyEdge,
  type DependencyNeighbour,
} from '@teambit/objects';
import { type CalcDepsGraphOptions, type ComponentIdByPkgName } from '@teambit/dependency-resolver';
import { getLockfileImporterId } from '@pnpm/lockfile.fs';
import normalizePath from 'normalize-path';

function convertLockfileToGraphFromCapsule(
  lockfile: LockfileFileV9,
  {
    componentRelativeDir,
    componentIdByPkgName,
  }: Pick<CalcDepsGraphOptions, 'componentRelativeDir' | 'componentIdByPkgName'>
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
  importerDependencies: InlineSpecifiersResolvedDependencies,
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
  lockfile: LockfileFileV9,
  { pkgName, componentRootDir, componentRelativeDir, componentIdByPkgName }: Omit<CalcDepsGraphOptions, 'rootDir'>
): DependenciesGraph {
  if (componentRootDir == null || pkgName == null) {
    return convertLockfileToGraphFromCapsule(lockfile, { componentRelativeDir, componentIdByPkgName });
  }
  const componentDevImporter = lockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  if (componentDevImporter.devDependencies != null) {
    directDependencies.push(...importerDepsToNeighbours(componentDevImporter.devDependencies, 'dev', false));
  }
  const lockedPkg =
    lockfile.snapshots![`${pkgName}@${lockfile.importers![componentRootDir].dependencies![pkgName].version}`];
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
  return _convertLockfileToGraph(lockfile, { componentIdByPkgName, directDependencies });
}

function _convertLockfileToGraph(
  lockfile: LockfileFileV9,
  {
    componentIdByPkgName,
    directDependencies,
  }: {
    componentIdByPkgName: ComponentIdByPkgName;
    directDependencies: DependencyNeighbour[];
  }
): DependenciesGraph {
  return new DependenciesGraph({
    edges: replaceFileVersionsWithPendingVersions(buildEdges(lockfile, { directDependencies, componentIdByPkgName }), componentIdByPkgName),
    packages: new Map(replaceFileVersionsWithPendingVersions(Array.from(buildPackages(lockfile, { componentIdByPkgName }).entries()), componentIdByPkgName)),
  });
}

function buildEdges(
  lockfile: LockfileFileV9,
  { directDependencies, componentIdByPkgName }: { directDependencies: DependencyNeighbour[]; componentIdByPkgName: ComponentIdByPkgName }
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const neighbours = extractDependenciesFromSnapshot(snapshot);
    const edge: DependencyEdge = {
      id: depPath,
      neighbours,
    };
    const pkgId = dp.removeSuffix(depPath);
    if (pkgId !== depPath) {
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
  edges.push({
    id: DependenciesGraph.ROOT_EDGE_ID,
    neighbours: replaceFileVersionsWithPendingVersions(directDependencies, componentIdByPkgName),
  });
  return edges;
}

function extractDependenciesFromSnapshot(snapshot: any): DependencyNeighbour[] {
  const dependencies: DependencyNeighbour[] = [];

  for (const { depTypeField, optional } of [
    { depTypeField: 'dependencies', optional: false },
    { depTypeField: 'optionalDependencies', optional: true },
  ]) {
    for (const [name, ref] of Object.entries((snapshot[depTypeField] ?? {}) as Record<string, string>)) {
      const subDepPath = dp.refToRelative(ref, name);
      if (subDepPath != null) {
        dependencies.push({ id: subDepPath, optional });
      }
    }
  }

  return dependencies;
}

function buildPackages(
  lockfile: LockfileFileV9,
  { componentIdByPkgName }: { componentIdByPkgName: ComponentIdByPkgName }
): PackagesMap {
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
    // if (pkgId.includes('@pending:')) {
    const parsed = dp.parse(pkgId);
    if (parsed.name && componentIdByPkgName.has(parsed.name)) {
      const compId = componentIdByPkgName.get(parsed.name)!;
      graphPkg.component = {
        name: compId.fullName,
        scope: compId.scope,
      };
    }
    // }
    packages.set(pkgId, graphPkg);
  }
  return packages;
}

function replaceFileVersionsWithPendingVersions<T>(obj: T, componentIdByPkgName: ComponentIdByPkgName): T {
  let s = JSON.stringify(obj);
  for (const [pkgName, componentId] of componentIdByPkgName.entries()) {
    s = s.replaceAll(new RegExp(`${pkgName}@file:[^'"(]+`, 'g'), `${pkgName}@${snapToSemver(componentId.version)}`);
  }
  return JSON.parse(s);
}

export async function convertGraphToLockfile(
  _graph: DependenciesGraph,
  {
    manifests,
    rootDir,
    resolve,
    registries,
  }: {
    manifests: Record<string, ProjectManifest>;
    rootDir: string;
    resolve: ResolveFunction;
    registries: Registries;
  }
): Promise<LockfileFileV9> {
  console.log('manifests', JSON.stringify(manifests, null, 2))
  let graphString = _graph.serialize();
  // console.log(JSON.stringify(graph.packages, null, 2))
  const graph = DependenciesGraph.deserialize(graphString)!;
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
  const lockfile: LockfileFileV9 & Required<Pick<LockfileFileV9, 'packages'>> = {
    lockfileVersion: '9.0',
    packages,
    snapshots,
    importers: {},
  };
  const rootEdge = graph.findRootEdge();
  if (rootEdge) {
    console.log('rootEdge.neighbours', rootEdge.neighbours)
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
                (directDep.specifier === specifier || specifier === '*' || dp.removeSuffix(directDep.id) === `${name}@${specifier}`)
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
  const pkgsToResolve: Array<{ name: string; version: string; pkgId: string }> = [];
  const pkgsInTheWorkspaces = new Set(Object.values(manifests).map(({ name }) => name));
  for (const [pkgId, pkg] of Object.entries(lockfile.packages)) {
    if (pkg.resolution == null || 'type' in pkg.resolution && pkg.resolution.type === 'directory') {
      const parsed = dp.parse(pkgId)
      if (parsed.name && parsed.version && !pkgsInTheWorkspaces.has(parsed.name)) {
        pkgsToResolve.push({
          name: parsed.name,
          version: parsed.version,
          pkgId,
        })
      }
    }
  }
  console.log('lockfile', JSON.stringify(lockfile, null, 2))
  console.log('pkgsToResolve', JSON.stringify(pkgsToResolve, null, 2))
  await Promise.all(pkgsToResolve.map(async (pkgToResolve) => {
    if (lockfile.packages[pkgToResolve.pkgId].resolution == null) {
      const { resolution } = await resolve({
        alias: pkgToResolve.name,
        pref: pkgToResolve.version,
      }, {
        lockfileDir: '',
        projectDir: '',
        registry: pickRegistryForPackage(registries, pkgToResolve.name),
        preferredVersions: {},
      })
      if ('integrity' in resolution && resolution.integrity) {
        console.log('XXXXXXXXXXXXXX', pkgToResolve, resolution.integrity)
        lockfile.packages[pkgToResolve.pkgId].resolution = {
          integrity: resolution.integrity,
        };
      }
    }
  }));
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

function depPathToRef(depPath: dp.DependencyPath): string {
  return `${depPath.version}${depPath.patchHash ?? ''}${depPath.peersSuffix ?? ''}`;
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
