import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ComponentMain, ComponentAspect, ComponentID } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { compact, intersection } from "lodash";
import { GetGraphOpts, GraphBuilder } from './graph-builder';
import { graphSchema } from './graph.graphql';
import { GraphAspect } from './graph.aspect';
import { GraphCmd, GraphOpt } from './graph-cmd';
import { ComponentGraph } from './component-graph';
import { ComponentIdGraph } from './component-id-graph';
import { GraphConfig, VisualDependencyGraph } from '@teambit/legacy.dependency-graph';

export class GraphMain {
  constructor(
    private componentAspect: ComponentMain,
    private logger: Logger
  ) {}

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

  /**
   * this visual graph-ids can render the graph as a SVG/png and other formats.
   */
  async getVisualGraphIds(ids?: ComponentID[], opts: GraphOpt = {}): Promise<VisualDependencyGraph> {
    this.logger.setStatusLine('loading graph');
    const { layout, includeLocalOnly, cycles } = opts;
    const graphVizOpts: GraphConfig = {}
    if (layout) graphVizOpts.layout = layout;
    const graphIdsAll = await this.getGraphIds(ids);

    const host = this.componentAspect.getHost();
    const list = await host.listIds();
    const idsWithVersion = await this.getIdsWithVersions(ids);
    const listStr = list.map((id) => id.toString());
    const graphIds = includeLocalOnly ? graphIdsAll.successorsSubgraph(idsWithVersion || listStr, {
      nodeFilter: (node) => listStr.includes(node.id),
      edgeFilter: (edge) => listStr.includes(edge.targetId) && listStr.includes(edge.sourceId)
    }) : graphIdsAll;
    this.logger.setStatusLine('rendering graph');
    if (cycles) {
      return this.getVisualCyclesFromGraph(graphIds, idsWithVersion, graphVizOpts);
    }
    return VisualDependencyGraph.loadFromClearGraph(graphIds, graphVizOpts, idsWithVersion);
  }

  private async getVisualCyclesFromGraph(graphIds: ComponentIdGraph, idsWithVersion?: string[],
    graphVizOpts: GraphConfig = {}
  ): Promise<VisualDependencyGraph> {
    const cyclesGraph = graphIds.findCycles();
    const multipleCycles = cyclesGraph.map((cycle) => {

      if (idsWithVersion && intersection(idsWithVersion, cycle).length < 1) return undefined;
      return graphIds.subgraph(cycle,
        {
          nodeFilter: (node) => cycle.includes(node.id),
          edgeFilter: (edge) => cycle.includes(edge.targetId)
        },
      );
    });
    return VisualDependencyGraph.loadFromMultipleClearGraphs(compact(multipleCycles), graphVizOpts, idsWithVersion);
  }

  private async getIdsWithVersions(ids?: ComponentID[]): Promise<string[] | undefined> {
    const host = this.componentAspect.getHost();
    if (!ids) return undefined;
    const comps = await host.getMany(ids);
    if (comps.length) return comps.map(comp => comp.id.toString());
    return undefined;
  }

  static slots = [];
  static dependencies = [GraphqlAspect, ComponentAspect, CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([graphql, componentAspect, cli, loggerMain]: [
    GraphqlMain,
    ComponentMain,
    CLIMain,
    LoggerMain,
  ]) {
    const logger = loggerMain.createLogger(GraphAspect.id);

    const graphBuilder = new GraphBuilder(componentAspect);
    graphql.register(() => graphSchema(graphBuilder, componentAspect));

    const graphMain = new GraphMain(componentAspect, logger);
    cli.register(new GraphCmd(componentAspect, graphMain));

    return graphMain;
  }
}

GraphAspect.addRuntime(GraphMain);
