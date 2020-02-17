import { Graph } from 'graphlib';
import PQueue from 'p-queue';
import { flatten, uniq } from 'ramda';
import { ResolvedComponent } from '../../workspace/resolved-component';
import { Consumer } from '../../../consumer';
import DependencyGraph from '../../../scope/graph/scope-graph';
import { Workspace } from '../../workspace';
import { ScriptsOptions } from '../scripts-options';

export type CacheWalk = {
  [k: string]: {
    state: Promise<any> | 'init';
    resolvedComponent: ResolvedComponent;
  };
};
export function getGraph(consumer: Consumer) {
  return DependencyGraph.buildGraphFromWorkspace(consumer, false, true);
}
export async function getTopologicalWalker(
  input: ResolvedComponent[],
  options: ScriptsOptions,
  workspace: Workspace,
  getGraphFn = getGraph
) {
  const graph = await createSubGraph(input, workspace.consumer, options, getGraphFn);
  const comps = await workspace.load(graph.nodes());
  const reporter: CacheWalk = comps.reduce((accum, comp) => {
    accum[comp.component.id.toString()] = {
      state: 'init',
      resolvedComponent: comp
    };
    return accum;
  }, {} as CacheWalk);

  const q = new PQueue({ concurrency: options.concurrency });
  const get = (ref: CacheWalk, g: Graph, action: 'sources' | 'nodes' = 'sources') =>
    g[action]()
      .filter(src => ref[src].state === 'init')
      .map(src => ref[src].resolvedComponent);

  function walk(visitor: (comp: ResolvedComponent) => Promise<any>) {
    if (!graph.nodes().length) {
      return Promise.resolve([]);
    }
    const seeders: ResolvedComponent[] = graph.sources().length
      ? get(reporter, graph)
      : [get(reporter, graph, 'nodes')[0]].filter(v => v);

    const seedersPromises = seeders.map(seed => {
      const id = seed.component.id.toString();
      reporter[id].state = q
        .add(() => visitor(seed))
        .catch(r => r)
        .then(res => {
          // should cache activity
          graph.removeNode(id);
          const sources = get(reporter, graph);
          return sources.length || (!q.pending && graph.nodes().length)
            ? Promise.all([Promise.resolve(res), walk(visitor)])
            : Promise.resolve([res]);
        });
      return (reporter[id].state as any) as Promise<any>;
    });
    return Promise.all(seedersPromises);
  }
  return { walk, reporter };
}

export async function createSubGraph(
  components: ResolvedComponent[],
  consumer: Consumer,
  options: ScriptsOptions,
  getGraphFn = getGraph
) {
  const g = await getGraphFn(consumer);
  const shouldStay = uniq(
    flatten(
      components.map(comp => {
        const id = comp.component.id.toString();
        const base = [id];
        let pre: string[] = [];
        let post: string[] = [];
        if (options.traverse === 'both' || options.traverse === 'dependencies') {
          pre = g.predecessors(id) || [];
        }
        if (options.traverse === 'both' || options.traverse === 'dependents') {
          post = g.successors(id) || [];
        }
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
/**
 * TODO - qballer
 * cache capsules to reuse - DONE
   cache script execution -
   proper output.
   stream execution for parsing
   {
      a: ['b','c']
      b: ['c']
      c: []
   },
   const {mockSpace, mockComponents} = createTestSuite()
   fake visitor which returns an array of processes.
 */
