import chalk from 'chalk';
import GraphLib from 'graphlib';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { GraphConfig, VisualDependencyGraph } from '@teambit/legacy.dependency-graph';
import { getRemoteByName } from '@teambit/scope.remotes';
import { ComponentMain } from '@teambit/component';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';

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

  constructor(private componentAspect: ComponentMain) {}

  async report([id]: [string], { remote, layout, png, cycles }: GraphOpt): Promise<string> {
    const workspace = this.componentAspect.getHost('teambit.workspace/workspace') as Workspace;
    if (!workspace && !remote) throw new OutsideWorkspaceError();

    const config: GraphConfig = {};
    if (layout) config.layout = layout;

    const getVisualGraph = async (): Promise<VisualDependencyGraph> => {
      if (workspace && !remote) {
        const graph = await this.generateGraphFromWorkspace(workspace, id);
        if (!cycles) {
          return VisualDependencyGraph.loadFromClearGraph(graph, config);
        }
        const cyclesGraph = graph.findCycles();
        const multipleCycles = cyclesGraph.map((cycle) => {
          return graph.subgraph(cycle,
            {
              nodeFilter: (node) => cycle.includes(node.id),
              edgeFilter: (edge) => cycle.includes(edge.targetId)
            },
          );
        });
        return VisualDependencyGraph.loadFromMultipleClearGraphs(multipleCycles, config);
      }
      const graph = await this.generateGraphFromRemote(remote!, id, workspace);
      return VisualDependencyGraph.loadFromGraphlib(graph, config);
    }

    const visualDependencyGraph = await getVisualGraph();
    const result = await visualDependencyGraph.render(png ? 'png' : 'svg');

    return chalk.green(`image created at ${result}`);
  }

  private async generateGraphFromWorkspace(workspace: Workspace, id?: string) {
    const compIds = id ? [await workspace.resolveComponentId(id)] : undefined;
    const graph = await workspace.getGraphIds(compIds);
    return graph;
  }

  private async generateGraphFromRemote(
    remote: string | boolean,
    id?: string,
    workspace?: Workspace,
  ): Promise<GraphLib.Graph> {
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

  async json([id]: [string], { remote }: GraphOpt) {
    const workspace = this.componentAspect.getHost('teambit.workspace/workspace') as Workspace;
    if (!workspace && !remote) throw new OutsideWorkspaceError();

    if (workspace && !remote) {
      const graph = await this.generateGraphFromWorkspace(workspace, id);
      return graph.toJson();
    }
    const graph = await this.generateGraphFromRemote(remote!, id, workspace);
    return GraphLib.json.write(graph);
  }
}
