import { ComponentFactory } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { buildOneGraphForComponents } from 'bit-bin/dist/scope/graph/components-graph';

import { ComponentGraph } from './component-graph';

export class GraphBuilder {
  _graph?: ComponentGraph;
  _initialized = false;
  constructor(private componentFactory: ComponentFactory, private workspace?: Workspace, private scope?: ScopeMain) {}

  async getGraph(): Promise<ComponentGraph | undefined> {
    if (this._graph || this._initialized) {
      return this._graph;
    }
    if (this.workspace) {
      const ids = (await this.workspace.list()).map((comp) => comp.id);
      const bitIds = ids.map((id) => id._legacy);
      const initialGraph = await buildOneGraphForComponents(bitIds, this.workspace.consumer);
      const graph = await ComponentGraph.buildFromLegacy(initialGraph, this.componentFactory);
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
