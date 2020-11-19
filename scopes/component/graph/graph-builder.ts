import { ComponentID } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import {
  buildOneGraphForComponents,
  buildOneGraphForComponentsUsingScope,
} from 'bit-bin/dist/scope/graph/components-graph';
import { ComponentGraph } from './component-graph';

import type { Dependency } from './dependency';

export class GraphBuilder {
  _graph?: ComponentGraph;
  _initialized = false;
  constructor(private workspace?: Workspace, private scope?: ScopeMain) {}

  async getGraph(
    ids?: string[] | ComponentID[],
    filter?: (dep: Dependency) => boolean
  ): Promise<ComponentGraph | undefined> {
    // if (this._graph || this._initialized) {
    //   return this._graph;
    // }
    if (this.workspace) {
      let listIds = ids && ids.length ? ids : (await this.workspace.list()).map((comp) => comp.id);
      if (typeof listIds[0] === 'string') {
        listIds = await this.workspace.resolveMultipleComponentIds(listIds);
      }
      // @ts-ignore
      const bitIds = listIds.map((id) => id._legacy);
      const legacyGraph = await buildOneGraphForComponents(bitIds, this.workspace.consumer);
      let graph = await ComponentGraph.buildFromLegacy(legacyGraph, this.workspace);

      if (filter) graph = this.filterGraph(graph, listIds, filter);

      this._graph = graph;
      this._initialized = true;
      return this._graph;
    }
    // Build graph from scope
    if (this.scope) {
      let listIds = ids && ids.length ? ids : (await this.scope.list()).map((comp) => comp.id);
      if (typeof listIds[0] === 'string') {
        listIds = await this.scope.resolveMultipleComponentIds(listIds);
      }
      // @ts-ignore
      const bitIds = listIds.map((id) => {
        let bitId = id._legacy;
        // The resolve bitId in scope will remove the scope name in case it's the same as the scope
        // We restore it back to use it correctly in the legacy code.
        if (!bitId.hasScope()) {
          bitId = bitId.changeScope(this.scope?.name);
        }
        return bitId;
      });
      const legacyGraph = await buildOneGraphForComponentsUsingScope(bitIds, this.scope.legacyScope);
      let graph = await ComponentGraph.buildFromLegacy(legacyGraph, this.scope);

      if (filter) graph = this.filterGraph(graph, listIds, filter);

      this._graph = graph;
      this._initialized = true;
      return this._graph;
    }
    return this._graph;
  }

  private filterGraph(graph: ComponentGraph, ids: (string | ComponentID)[], filter: (dep: Dependency) => boolean) {
    const graphIds = resolveGraphIds(graph, ids);

    const filtered = graph.successorsSubgraph(graphIds, filter);

    return filtered;
  }
}

function resolveGraphIds(graph: ComponentGraph, ids: (string | ComponentID)[]) {
  return ids
    .map((x: string | ComponentID) => {
      if (typeof x === 'string') return x;

      return (
        (graph.hasNode(x.toString()) && x.toString()) ||
        (graph.hasNode(x.toString({ ignoreVersion: true })) && x.toString({ ignoreVersion: true })) ||
        (graph.hasNode(x.fullName) && x.fullName) ||
        undefined
      );
    })
    .filter((x) => !!x) as string[];
}
