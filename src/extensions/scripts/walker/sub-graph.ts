import { Graph } from 'graphlib';
import { uniq, flatten } from 'ramda';
import { ResolvedComponent } from '../../workspace/resolved-component';
import { ScriptsOptions } from '../scripts-options';

export function createSubGraph(components: ResolvedComponent[], options: ScriptsOptions, graph: Graph) {
  const shouldStay = uniq(
    flatten(
      components.map(comp => {
        const id = comp.component.id.toString();
        const base = [id];
        let pre: string[] = [];
        let post: string[] = [];
        if (options.traverse === 'both' || options.traverse === 'dependencies') {
          pre = getNeighborsByDirection(id, graph);
        }
        if (options.traverse === 'both' || options.traverse === 'dependents') {
          post = getNeighborsByDirection(id, graph, 'successors');
        }
        return base.concat(post).concat(pre);
      })
    )
  );
  return graph.nodes().reduce((g, curr) => {
    // eslint-disable-next-line no-bitwise
    if (!~shouldStay.indexOf(curr)) {
      g.removeNode(curr);
    }
    return graph;
  }, graph);
}

export function getNeighborsByDirection(
  id: string,
  g: Graph,
  direction: 'predecessors' | 'successors' = 'predecessors'
): string[] {
  const parents = g[direction](id) || [];
  return parents.concat(parents.map(pre => flatten(getNeighborsByDirection(pre, g, direction))));
}
