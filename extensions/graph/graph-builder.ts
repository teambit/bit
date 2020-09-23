import { ComponentID } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { buildOneGraphForComponents } from 'bit-bin/dist/scope/graph/components-graph';

import { ComponentGraph } from './component-graph';

export class GraphBuilder {
  _graph?: ComponentGraph;
  _initialized = false;
  constructor(private workspace?: Workspace, private scope?: ScopeMain) {}

  async getGraph(ids?: string[] | ComponentID[]): Promise<ComponentGraph | undefined> {
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
      const graph = await ComponentGraph.buildFromLegacy(legacyGraph, this.workspace);
      this._graph = graph;
      this._initialized = true;
      return this._graph;
    }
    // TODO: implement using buildOneGraphForComponentsUsingScope (probably)
    if (this.scope) {
      this._initialized = true;
      return this._graph;
    }
    return this._graph;
  }
}
