import { LockfileFileV9 } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import pick from 'ramda/src/pick';
import partition from 'ramda/src/partition';

export function convertLockfileToGraph(lockfile: LockfileFileV9) {
  const nodes: any[] = [];
  const edges: any[] = [];
  for (const [depPath, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const neighbours: Array<{ id: string; type: string }> = [];
    for (const { depTypeField, depType } of [
      { depTypeField: 'dependencies', depType: 'prod' },
      { depTypeField: 'optionalDependencies', depType: 'optional' },
    ]) {
      for (const pkgName in snapshot[depTypeField]) {
        const subDepPath = dp.refToRelative(snapshot[depTypeField][pkgName], pkgName);
        if (subDepPath == null) continue;
        neighbours.push({ id: subDepPath, type: depType });
      }
    }
    const pkgId = dp.removeSuffix(depPath);
    const edge = {
      id: depPath,
      neighbours,
      attr: {
        pkgId,
      },
    } as any;
    if (snapshot.transitivePeerDependencies) {
      edge.attr.transitivePeerDependencies = snapshot.transitivePeerDependencies;
    }
    edges.push(edge);
    nodes.push({
      pkgId,
      attr: pick(
        [
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
        ],
        lockfile.packages![pkgId]
      ),
    });
  }
  return { edges, nodes };
}

export function convertGraphToLockfile(graph): LockfileFileV9 {
  const packages = {};
  const snapshots = {};
  for (const edge of graph.edges) {
    snapshots[edge.id] = {};
    packages[edge.attr.pkgId] = {};
    const [prodDeps, optionalDeps] = partition((dep) => dep.type === 'prod', edge.neighbours);
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
    packages[edge.attr.pkgId].resolution = node.attr.resolution;
  }
  return {
    lockfileVersion: '9.0',
    packages,
    snapshots,
  };
}
