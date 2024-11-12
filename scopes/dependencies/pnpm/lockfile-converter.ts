import { LockfileFileV9 } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import { pick, partition } from 'lodash';
import {
  type DependenciesGraph,
  type DependencyNode,
  type DependencyEdge,
  type DependencyNeighbour,
} from '@teambit/legacy/dist/scope/models/version';

export function convertLockfileToGraph(lockfile: LockfileFileV9): Pick<DependenciesGraph, 'nodes' | 'edges'> {
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
  return { edges, nodes };
}

export function convertGraphToLockfile(graph: DependenciesGraph): LockfileFileV9 {
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
  return {
    lockfileVersion: '9.0',
    packages,
    snapshots,
  };
}
