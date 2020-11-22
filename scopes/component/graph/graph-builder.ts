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
      // resolve string to component ids:
      let resolvedIds =
        ids && ids.length > 0 && typeof ids[0] === 'string'
          ? await this.workspace.resolveMultipleComponentIds(ids)
          : (ids as ComponentID[] | undefined);

      // default value
      if (!resolvedIds || !resolvedIds.length) {
        resolvedIds = (await this.workspace.list()).map((comp) => comp.id);
      }

      const bitIds = resolvedIds.map((id) => id._legacy);
      const legacyGraph = await buildOneGraphForComponents(bitIds, this.workspace.consumer);
      let graph = await ComponentGraph.buildFromLegacy(legacyGraph, this.workspace);

      if (filter) graph = this.filterGraph(graph, resolvedIds, filter);

      this._graph = graph;
      this._initialized = true;
      return this._graph;
    }

    // Build graph from scope
    if (this.scope) {
      // resolve string to component ids:
      let resolvedIds =
        ids && ids.length > 0 && typeof ids[0] === 'string'
          ? await this.scope.resolveMultipleComponentIds(ids)
          : (ids as ComponentID[] | undefined);

      // default value
      if (!resolvedIds || !resolvedIds.length) {
        resolvedIds = (await this.scope.list()).map((comp) => comp.id);
      }

      const bitIds = resolvedIds.map((id) => {
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

      if (filter) graph = this.filterGraph(graph, resolvedIds, filter);

      this._graph = graph;
      this._initialized = true;
      return this._graph;
    }
    return this._graph;
  }

  private filterGraph(graph: ComponentGraph, ids: ComponentID[], filter: (dep: Dependency) => boolean) {
    const graphIds = ids.map((x) => x.toString());

    const filtered = graph.successorsSubgraph(graphIds, filter);

    return filtered;
  }
}
