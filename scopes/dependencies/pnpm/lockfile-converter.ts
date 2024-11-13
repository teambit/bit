import { type ProjectManifest } from '@pnpm/types';
import { LockfileFileV9 } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import { pick, partition } from 'lodash';
import {
  DependenciesGraph,
  type DependencyNode,
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
  for (const [name, { version, specifier }] of Object.entries(componentDevImporter.devDependencies ?? {}) as any) {
    directDependencies.push({ name, specifier, id: dp.refToRelative(version, name)! });
  }
  const lockedPkg =
    lockfile.snapshots![`${pkgName}@${lockfile.importers![componentRootDir].dependencies![pkgName].version}`];
  for (const depType of ['dependencies' as const, 'optionalDependencies' as const]) {
    for (const [name, version] of Object.entries(lockedPkg[depType] ?? {})) {
      directDependencies.push({
        name,
        specifier: componentDevImporter[depType]?.[name]?.specifier ?? '*',
        id: dp.refToRelative(version, name)!,
      });
    }
  }
  lockfile = replaceFileVersionsWithPendingVersions(lockfile);
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const neighbours: DependencyNeighbour[] = [];
    for (const { depTypeField, optional } of [
      { depTypeField: 'dependencies', optional: false },
      { depTypeField: 'optionalDependencies', optional: true },
    ]) {
      for (const [pkgName, ref] of Object.entries((snapshot[depTypeField] ?? {}) as Record<string, string>)) {
        const subDepPath = dp.refToRelative(ref, pkgName);
        if (subDepPath == null) continue;
        neighbours.push({ id: subDepPath, optional });
      }
    }
    const pkgId = dp.removeSuffix(depPath);
    const edge: DependencyEdge = {
      id: depPath,
      neighbours,
      attr: {
        pkgId,
      },
    };
    if (snapshot.transitivePeerDependencies) {
      edge.attr.transitivePeerDependencies = snapshot.transitivePeerDependencies;
    }
    edges.push(edge);
    nodes.push({
      pkgId,
      attr: pick(lockfile.packages![pkgId], [
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
      ]) as any,
    });
  }
  for (const node of nodes) {
    if (node.pkgId.includes('@pending:')) {
      const parsed = dp.parse(node.pkgId);
      if (parsed.name && componentIdByPkgName.has(parsed.name)) {
        node.attr.component = componentIdByPkgName.get(parsed.name);
      }
    }
  }
  edges.push({
    id: '.',
    neighbours: replaceFileVersionsWithPendingVersions(directDependencies),
    attr: {
      pkgId: '.',
    },
  });
  return new DependenciesGraph({ edges, nodes });
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
  for (const edge of graph.edges) {
    if (edge.id === '.') continue;
    snapshots[edge.id] = {};
    packages[edge.attr.pkgId] = {};
    const [optionalDeps, prodDeps] = partition(edge.neighbours, (dep) => dep.optional);
    if (prodDeps.length) {
      snapshots[edge.id].dependencies = Object.fromEntries(
        prodDeps.map(({ id }) => {
          const parsed = dp.parse(id);
          return [parsed.name, `${parsed.version}${parsed.peersSuffix ?? ''}`]; // TODO: support peers
        })
      );
    }
    if (optionalDeps.length) {
      snapshots[edge.id].optionalDependencies = Object.fromEntries(
        optionalDeps.map(({ id }) => {
          const parsed = dp.parse(id);
          return [parsed.name, `${parsed.version}${parsed.peersSuffix ?? ''}`]; // TODO: support peers
        })
      );
    }
    const node = graph.nodes.find(({ pkgId }) => edge.attr.pkgId === pkgId);
    if (node) {
      Object.assign(
        packages[edge.attr.pkgId],
        pick(node.attr, [
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
        ])
      );
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
    const directDependencies = graph.edges.find((edge) => edge.id === '.');
    if (directDependencies) {
      for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, specifier] of Object.entries(manifest[depType] ?? {})) {
          const edgeId = directDependencies.neighbours.find(
            (directDep) => directDep.name === name && directDep.specifier === specifier
          )?.id;
          if (edgeId) {
            const parsed = dp.parse(edgeId);
            const ref = `${parsed.version}${parsed.peersSuffix ?? ''}`;
            lockfile.importers![projectId][depType][name] = { version: ref, specifier };
          }
        }
      }
    }
  }
  return lockfile;
}
