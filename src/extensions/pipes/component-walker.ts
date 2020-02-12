import { Graph } from 'graphlib';
import PQueue from 'p-queue';
import { ResolvedComponent } from '../workspace/resolved-component';
import { Consumer } from '../../consumer';
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';

export type CacheWalk = {
  [k: string]: {
    state: Promise<any> | 'init';
    resolvedComponent: ResolvedComponent;
  };
};

export async function getTopologicalWalker(comps: ResolvedComponent[], concurrency: number, consumer: Consumer) {
  const graph = await buildOneGraphForComponents(
    comps.map(comp => comp.component.id._legacy),
    consumer,
    'reverse'
  );
  const cache: CacheWalk = comps.reduce((accum, comp) => {
    accum[comp.component.id.toString()] = {
      state: 'init',
      resolvedComponent: comp
    };
    return accum;
  }, {} as CacheWalk);

  const q = new PQueue({ concurrency });
  const get = (c: CacheWalk, g: Graph, action: 'sources' | 'nodes' = 'sources') =>
    g[action]()
      .filter(src => cache[src].state !== 'init')
      .map(src => cache[src].resolvedComponent);

  return function walk(visitor: (comp: ResolvedComponent) => Promise<any>) {
    if (!graph.nodes().length) {
      return Promise.resolve([]);
    }
    const seeders: ResolvedComponent[] = graph.sources().length
      ? get(cache, graph)
      : [get(cache, graph, 'nodes')[0]].filter(v => v);

    const seedersPromises = seeders.map(seed => {
      const id = seed.component.id.toString();

      cache[id].state = q.add(() => visitor(seed));
      // eslint-disable-next-line promise/catch-or-return
      ((cache[id].state as any) as Promise<any>).then(res => {
        graph.removeNode(id);
        return get(cache, graph).length || q.pending === 0 ? walk(visitor) : Promise.resolve([]);
      });

      return (cache[id].state as any) as Promise<any>;
    });
    return Promise.all(seedersPromises);
  };
}
