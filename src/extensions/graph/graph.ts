import { ComponentFactory } from '../component';
import { BitCli } from '../cli';
import { InsightsCmd } from './insights.cmd';
import LegacyGraph from '../../scope/graph/scope-graph';
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
    const Graph = await ComponentGraph.buildFromWorkspace(this.workspace.consumer, this.componentFactory);
    return Graph;
  }

  static async provide(config: {}, [componentFactory, cli, workspace]: GraphDeps) {
    const graph = new Graph(componentFactory, workspace);
    cli.register(new InsightsCmd(graph));
    return graph;
  }
}
