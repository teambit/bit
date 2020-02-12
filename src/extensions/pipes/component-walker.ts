import { Graph } from 'graphlib';
import PQueue from 'p-queue';
import { flatten, uniq } from 'ramda';
import { ResolvedComponent } from '../workspace/resolved-component';
import { Consumer } from '../../consumer';
import DependencyGraph from '../../scope/graph/scope-graph';
import { Workspace } from '../workspace';

export type CacheWalk = {
  [k: string]: {
    state: Promise<any> | 'init';
    resolvedComponent: ResolvedComponent;
  };
};

export async function getTopologicalWalker(input: ResolvedComponent[], concurrency: number, workspace: Workspace) {
  const graph = await createSubGraph(input, workspace.consumer);
  const comps = await workspace.load(graph.nodes());
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
      .filter(src => cache[src].state === 'init')
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
        // should cache activity
        graph.removeNode(id);
        const sources = get(cache, graph);
        return sources.length || !q.pending ? walk(visitor) : Promise.resolve([]);
      });

      return (cache[id].state as any) as Promise<any>;
    });
    return Promise.all(seedersPromises);
  };
}

export async function createSubGraph(components: ResolvedComponent[], consumer: Consumer) {
  const g = await DependencyGraph.buildGraphFromWorkspace(consumer, false, true);
  const shouldStay = uniq(
    flatten(
      components.map(comp => {
        const id = comp.component.id.toString();
        const base = [id];
        const pre = g.predecessors(id) || [];
        const post = g.successors(id) || [];
        return base.concat(post).concat(pre);
      })
    )
  );
  return g.nodes().reduce((accum, curr) => {
    // eslint-disable-next-line no-bitwise
    if (!~shouldStay.indexOf(curr)) {
      g.removeNode(curr);
    }
    return accum;
  }, g);
}
