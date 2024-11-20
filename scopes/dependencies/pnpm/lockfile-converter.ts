import semver from 'semver';
import { type ProjectManifest } from '@pnpm/types';
import { LockfileFileV9 } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import { pick, partition } from 'lodash';
import {
  DependenciesGraph,
  type PackagesMap,
  type PackageAttributes,
  type DependencyEdge,
  type DependencyNeighbour,
} from '@teambit/legacy/dist/scope/models/version';
import { type GetDependenciesGraphOptions } from '@teambit/dependency-resolver';
import { getLockfileImporterId } from '@pnpm/lockfile.fs';

export function convertLockfileToGraph(
  lockfile: LockfileFileV9,
  {
    pkgName,
    componentRootDir,
    componentRelativeDir,
    componentIdByPkgName,
  }: Omit<GetDependenciesGraphOptions, 'workspacePath'>
): DependenciesGraph {
  const componentDevImporter = lockfile.importers![componentRelativeDir];
  const directDependencies: DependencyNeighbour[] = [];
  for (const [name, { version }] of Object.entries(componentDevImporter.devDependencies ?? {}) as any) {
    const id = dp.refToRelative(version, name)!;
    directDependencies.push({ name, version: dp.parse(id).version, id, lifecycle: 'dev' });
  }
  const lockedPkg =
    lockfile.snapshots![`${pkgName}@${lockfile.importers![componentRootDir].dependencies![pkgName].version}`];
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const]) {
    for (const [name, version] of Object.entries(lockedPkg[depType] ?? {})) {
      const id = dp.refToRelative(version, name)!;
      directDependencies.push({
        name,
        version: dp.parse(id).version,
        id,
        lifecycle: 'runtime',
      });
    }
  }
  lockfile = replaceFileVersionsWithPendingVersions(lockfile);
  const packages: PackagesMap = new Map();
  const edges: DependencyEdge[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const neighbours: DependencyNeighbour[] = [];
    for (const { depTypeField, optional } of [
      { depTypeField: 'dependencies', optional: false },
      { depTypeField: 'optionalDependencies', optional: true },
    ]) {
      for (const [depPkgName, ref] of Object.entries((snapshot[depTypeField] ?? {}) as Record<string, string>)) {
        const subDepPath = dp.refToRelative(ref, depPkgName);
        if (subDepPath == null) continue;
        neighbours.push({ id: subDepPath, optional });
      }
    }
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
    packages.set(
      pkgId,
      pick(lockfile.packages![pkgId], [
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
      ]) as any
    );
  }
  for (const [pkgId, pkgAttr] of packages.entries()) {
    if (pkgId.includes('@pending:')) {
      const parsed = dp.parse(pkgId);
      if (parsed.name && componentIdByPkgName.has(parsed.name)) {
        pkgAttr.component = componentIdByPkgName.get(parsed.name);
      }
    }
  }
  edges.push({
    id: DependenciesGraph.ROOT_EDGE_ID,
    neighbours: replaceFileVersionsWithPendingVersions(directDependencies),
  });
  return new DependenciesGraph({ edges, packages });
}

function replaceFileVersionsWithPendingVersions<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj).replaceAll(/file:[^'"(]+/g, 'pending:'));
}

export function convertGraphToLockfile(
  graph: DependenciesGraph,
  manifests: Record<string, ProjectManifest>,
  rootDir: string
): LockfileFileV9 {
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
  const lockfile = {
    lockfileVersion: '9.0',
    packages,
    snapshots,
    importers: {},
  };
  for (const [projectDir, manifest] of Object.entries(manifests)) {
    const projectId = getLockfileImporterId(rootDir, projectDir);
    lockfile.importers![projectId] = {
      dependencies: {},
      devDependencies: {},
      optionalDependencies: {},
    };
    const rootEdge = graph.findRootEdge();
    if (rootEdge) {
      for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, specifier] of Object.entries(manifest[depType] ?? {})) {
          const edgeId = rootEdge.neighbours.find(
            (directDep) => directDep.name === name && semver.satisfies(directDep.version!, specifier as string)
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
