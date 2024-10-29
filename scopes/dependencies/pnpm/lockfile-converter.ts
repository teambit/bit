import { Lockfile } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import pick from 'ramda/src/pick';
import partition from 'ramda/src/partition';

export function convertLockfileToGraph(lockfile: Lockfile) {
  const nodes: any[] = [];
  const edges: any[] = [];
  for (const [depPath, pkg] of Object.entries(lockfile.packages ?? {})) {
    const neighbours: Array<{ id: string; type: string }> = [];
    for (const { depTypeField, depType } of [
      { depTypeField: 'dependencies', depType: 'prod' },
      { depTypeField: 'optionalDependencies', depType: 'optional' },
    ]) {
      for (const pkgName in pkg[depTypeField]) {
        const subDepPath = dp.refToRelative(pkg[depTypeField][pkgName], pkgName);
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
    };
    edges.push(edge);
    if (pkg.transitivePeerDependencies) {
      edge.attr.transitivePeerDependencies = pkg.transitivePeerDependencies;
    }
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
        pkg
      ),
    });
  }
  return { edges, nodes };
}

export function convertGraphToLockfile(graph): Lockfile {
  const packages = {};
  for (const edge of graph.edges) {
    packages[edge.id] = {};
    const [prodDeps, optionalDeps] = partition((dep) => dep.type === 'prod', edge.neighbours);
    if (prodDeps.length) {
      packages[edge.id].dependencies = Object.fromEntries(
        prodDeps.map(({ id }) => {
          const parsed = dp.parse(id);
          return [parsed.name, `${parsed.version}${parsed.peersSuffix ?? ''}`]; // TODO: support peers
        })
      );
    }
    if (optionalDeps.length) {
      packages[edge.id].optionalDependencies = Object.fromEntries(
        optionalDeps.map(({ id }) => {
          const parsed = dp.parse(id);
          return [parsed.name, `${parsed.version}${parsed.peersSuffix ?? ''}`]; // TODO: support peers
        })
      );
    }
    const node = graph.nodes.find(({ pkgId }) => edge.attr.pkgId === pkgId);
    packages[edge.id].resolution = node.attr.resolution;
  }
  return {
    packages,
  };
}
