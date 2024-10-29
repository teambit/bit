import { Lockfile } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';
import pick from 'ramda/src/pick';

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
