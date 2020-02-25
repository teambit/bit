import { ComponentFactory } from '../component';
import { BitCli } from '../cli';
import { Workspace } from '../workspace';
import { ComponentGraph } from './component-graph';
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';

export type GraphDeps = [ComponentFactory, BitCli, Workspace];

export class Graph {
  constructor(
    /**
     * component factory
     */
    private componentFactory: ComponentFactory,

    /**
     * bit's workspace
     */
    private workspace: Workspace
  ) {}

  async build() {
    const ids = (await this.workspace.list()).map(comp => comp.id);
    const bitIds = ids.map(id => id._legacy);
    const initialGraph = await buildOneGraphForComponents(bitIds, this.workspace.consumer);
    const Graph = new ComponentGraph();
    return Graph.buildFromLegacy(initialGraph);
  }

  static async provide(config: {}, [componentFactory, cli, workspace]: GraphDeps) {
    const graph = new Graph(componentFactory, workspace);
    return graph.build();
  }
}
