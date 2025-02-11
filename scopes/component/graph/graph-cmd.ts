import chalk from 'chalk';
import GraphLib from 'graphlib';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { GraphConfig, VisualDependencyGraph } from '@teambit/legacy.dependency-graph';
import { getRemoteByName } from '@teambit/scope.remotes';
import { ComponentMain } from '@teambit/component';
import type { Workspace } from '@teambit/workspace';
import { GraphMain } from './graph.main.runtime';

type GraphOpt = {
  remote?: string;
  allVersions?: boolean;
  layout?: string;
  cycles?: boolean;
  png?: boolean;
  json?: boolean;
};

export class GraphCmd implements Command {
  name = 'graph [id]';
  description = "generate an SVG image file with the workspace components' dependencies graph";
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
    ['', 'cycles', 'show cycles in the graph'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  remoteOp = true;

  constructor(private componentAspect: ComponentMain, private graph: GraphMain) {}

  async report([id]: [string], { remote, layout, png, cycles }: GraphOpt): Promise<string> {
    const host = this.componentAspect.getHost();
    const config: GraphConfig = {};
    if (layout) config.layout = layout;

    const getVisualGraph = async (): Promise<VisualDependencyGraph> => {
      if (remote) {
        const graph = await this.generateGraphFromRemote(remote, id);
        return VisualDependencyGraph.loadFromGraphlib(graph, config);
      }
      const compId = id ? await host.resolveComponentId(id) : undefined;
      const compIds = compId ? [compId] : undefined
      return cycles
        ? this.graph.getVisualCycles(compIds, {}, config)
        : this.graph.getVisualGraphIds(compIds, {}, config);
    }

    const visualDependencyGraph = await getVisualGraph();
    const result = await visualDependencyGraph.render(png ? 'png' : 'svg');

    return chalk.green(`image created at ${result}`);
  }

  async json([id]: [string], { remote }: GraphOpt) {
    const host = this.componentAspect.getHost();
    if (!remote) {
      const graph = await this.graph.getGraphIds(id ? [await host.resolveComponentId(id)] : undefined);
      return graph.toJson();
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

  private async generateGraphFromRemote(
    remote: string | boolean,
    id?: string,
  ): Promise<GraphLib.Graph> {
    const workspace = this.getWorkspaceIfExist();
    const bitId = id ? ComponentID.fromString(id) : undefined;
    if (id) {
      // @ts-ignore scope must be set as it came from a remote
      const scopeName: string = typeof remote === 'string' ? remote : bitId.scope;
      const remoteScope = await getRemoteByName(scopeName, workspace?.consumer);
      const componentDepGraph = await remoteScope.graph(bitId);
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
