import chalk from 'chalk';
import GraphLib from 'graphlib';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { GraphConfig, VisualDependencyGraph } from '@teambit/legacy.dependency-graph';
import { getRemoteByName } from '@teambit/scope.remotes';
import { ComponentMain } from '@teambit/component';
import type { Workspace } from '@teambit/workspace';
import { GraphMain } from './graph.main.runtime';

export type GraphOpt = {
  remote?: string;
  layout?: string;
  cycles?: boolean;
  png?: boolean;
  json?: boolean;
  includeLocalOnly?: boolean;
};

export class GraphCmd implements Command {
  name = 'graph [id]';
  description = "generate an SVG image file with the components' dependencies graph";
  extendedDescription: 'black arrow is a runtime dependency. red arrow is either dev or peer';
  group = 'discover';
  alias = '';
  options = [
    ['r', 'remote [remoteName]', 'remote name (name is optional, leave empty when id is specified)'],
    [
      '',
      'layout <name>',
      'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]',
    ],
    ['', 'png', 'save the graph as a png file instead of svg. requires "graphviz" to be installed'],
    ['', 'cycles', 'generate a graph of cycles only'],
    ['', 'include-local-only', 'include only the components in the workspace (or local scope)'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  remoteOp = true;

  constructor(
    private componentAspect: ComponentMain,
    private graph: GraphMain
  ) {}

  async report([id]: [string], graphOpts: GraphOpt): Promise<string> {
    const { remote, layout, png } = graphOpts;
    const host = this.componentAspect.getHost();

    const getVisualGraph = async (): Promise<VisualDependencyGraph> => {
      if (remote) {
        const config: GraphConfig = {};
        if (layout) config.layout = layout;
        const graph = await this.generateGraphFromRemote(remote, id);
        return VisualDependencyGraph.loadFromGraphlib(graph, config);
      }
      const compId = id ? await host.resolveComponentId(id) : undefined;
      const compIds = compId ? [compId] : undefined;
      return this.graph.getVisualGraphIds(compIds, graphOpts);
    };

    const visualDependencyGraph = await getVisualGraph();
    const result = await visualDependencyGraph.render(png ? 'png' : 'svg');

    return chalk.green(`image created at ${result}`);
  }

  async json([id]: [string], { remote }: GraphOpt) {
    const host = this.componentAspect.getHost();
    if (!remote) {
      const graph = await this.graph.getGraphIds(id ? [await host.resolveComponentId(id)] : undefined);
      const jsonGraph = graph.toJson();
      if (jsonGraph.nodes) {
        jsonGraph.nodes = jsonGraph.nodes.map((node) => node.id);
      }
      return jsonGraph;
    }
    const graph = await this.generateGraphFromRemote(remote!, id);
    return GraphLib.json.write(graph);
  }

  private getWorkspaceIfExist(): Workspace | undefined {
    try {
      return this.componentAspect.getHost('teambit.workspace/workspace') as Workspace | undefined;
    } catch {
      return undefined;
    }
  }

  private async generateGraphFromRemote(remote: string | boolean, id?: string): Promise<GraphLib.Graph> {
    const workspace = this.getWorkspaceIfExist();
    const compId = id ? ComponentID.fromString(id) : undefined;
    if (compId) {
      const scopeName: string = typeof remote === 'string' ? remote : compId.scope;
      const remoteScope = await getRemoteByName(scopeName, workspace?.consumer);
      const componentDepGraph = await remoteScope.graph(compId);
      return componentDepGraph.graph;
    }
    if (typeof remote !== 'string') {
      throw new Error('please specify remote scope name or enter an id');
    }
    const remoteScope = await getRemoteByName(remote, workspace?.consumer);
    const componentDepGraph = await remoteScope.graph();
    return componentDepGraph.graph;
  }
}
