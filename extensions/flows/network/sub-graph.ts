import { Component } from '@teambit/component';
import { Graph } from 'graphlib';
import { flatten, uniq } from 'ramda';

import { ExecutionOptions } from './options';

export function createSubGraph(components: Component[], options: ExecutionOptions, graph: Graph) {
  const shouldStay = uniq(
    flatten(
      components.map((comp) => {
        const id = comp.id.toString();
        const base = [id];
        let pre: string[] = [];
        let post: string[] = [];
        if (options.traverse === 'both' || options.traverse === 'dependencies') {
          pre = getNeighborsByDirection(id, graph, 'predecessors');
        }
        if (options.traverse === 'both' || options.traverse === 'dependents') {
          post = getNeighborsByDirection(id, graph);
        }
        return base.concat(post).concat(pre);
      })
    )
  );

  return graph.nodes().reduce((g, curr) => {
    if (!shouldStay.includes(curr)) {
      g.removeNode(curr);
    }
    return graph;
  }, graph);
}

export function getNeighborsByDirection(
  id: string,
  g: Graph,
  direction: 'predecessors' | 'successors' = 'successors'
): string[] {
  const neighbors = g[direction](id) || [];
  return neighbors.concat(neighbors.map((pre) => flatten(getNeighborsByDirection(pre, g, direction))));
}
