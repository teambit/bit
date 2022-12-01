import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, ComponentID } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { GetGraphOpts, GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';
import { GraphAspect } from './graph.aspect';
import { GraphCmd } from './graph-cmd';
import { ComponentGraph } from './component-graph';
import { ComponentIdGraph } from './component-id-graph';

export class GraphMain {
  constructor(private componentAspect: ComponentMain, private logger: Logger) {}

  /**
   * important - prefer using `getGraphIds()` it's way better in terms of performance.
   */
  async getGraph(ids?: ComponentID[], opts: GetGraphOpts = {}): Promise<ComponentGraph> {
    const graphBuilder = new GraphBuilder(this.componentAspect);
    return graphBuilder.getGraph(ids, opts);
  }

  async getGraphIds(ids?: ComponentID[], opts: GetGraphOpts = {}): Promise<ComponentIdGraph> {
    const graphBuilder = new GraphBuilder(this.componentAspect);
    return graphBuilder.getGraphIds(ids, opts);
  }

  static slots = [];
  static dependencies = [GraphqlAspect, ComponentAspect, CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([graphql, componentAspect, cli, loggerMain]: [
    GraphqlMain,
    ComponentMain,
    CLIMain,
    LoggerMain
  ]) {
    const logger = loggerMain.createLogger(GraphAspect.id);

    const graphBuilder = new GraphBuilder(componentAspect);
    graphql.register(graphSchema(graphBuilder, componentAspect));

    const graphMain = new GraphMain(componentAspect, logger);
    cli.register(new GraphCmd());

    return graphMain;
  }
}

GraphAspect.addRuntime(GraphMain);
