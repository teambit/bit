import chalk from 'chalk';
import GraphLib from 'graphlib';
import type { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import type { GraphConfig } from '@teambit/legacy.dependency-graph';
import { VisualDependencyGraph } from '@teambit/legacy.dependency-graph';
import { getRemoteByName } from '@teambit/scope.remotes';
import type { ComponentMain } from '@teambit/component';
import type { GraphMain } from './graph.main.runtime';

export type GraphOpt = {
  remote?: string;
  layout?: string;
  cycles?: boolean;
  png?: boolean;
  json?: boolean;
  includeLocalOnly?: boolean;
  includeDependencies?: boolean;
};

export class GraphCmd implements Command {
  name = 'graph [id]';
  description = "generate an SVG image file with the components' dependencies graph";
  extendedDescription: 'black arrow is a runtime dependency. red arrow is either dev or peer';
  group = 'info-analysis';
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
    [
      '',
      'include-local-only',
      'DEPRECATED: include only the components in the workspace (or local scope). This is now the default behavior.',
    ],
    [
      '',
      'include-dependencies',
      'include all dependencies recursively, not just workspace (or local scope) components',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  remoteOp = true;

  constructor(
    private componentAspect: ComponentMain,
    private graph: GraphMain
  ) {}

  async report([id]: [string], graphOpts: GraphOpt): Promise<string> {
    const { remote, layout, png, includeLocalOnly, includeDependencies } = graphOpts;
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

      // New logic: local-only is now the default behavior
      // includeDependencies flag overrides this to show all dependencies
      const modifiedOpts = {
        ...graphOpts,
        includeLocalOnly: includeDependencies ? false : includeLocalOnly !== false, // true by default unless includeDependencies is used
      };

      return this.graph.getVisualGraphIds(compIds, modifiedOpts);
    };

    const visualDependencyGraph = await getVisualGraph();
    const result = await visualDependencyGraph.render(png ? 'png' : 'svg');

    return chalk.green(`image created at ${result}`);
  }

  async json([id]: [string], graphOpts: GraphOpt) {
    const { remote, includeLocalOnly, includeDependencies } = graphOpts;
    const host = this.componentAspect.getHost();
    if (!remote) {
      // For JSON output, we need to manually filter if needed
      // Since getGraphIds doesn't accept the same options as getVisualGraphIds
      const shouldIncludeLocalOnly = includeDependencies ? false : includeLocalOnly !== false;

      const graph = await this.graph.getGraphIds(id ? [await host.resolveComponentId(id)] : undefined);

      let filteredGraph = graph;
      if (shouldIncludeLocalOnly) {
        // Filter to only include local components
        const list = await host.listIds();
        const listStr = list.map((compId) => compId.toString());
        filteredGraph = graph.successorsSubgraph(listStr, {
          nodeFilter: (node) => listStr.includes(node.id),
          edgeFilter: (edge) => listStr.includes(edge.targetId) && listStr.includes(edge.sourceId),
        });
      }

      const jsonGraph = filteredGraph.toJson();
      if (jsonGraph.nodes) {
        jsonGraph.nodes = jsonGraph.nodes.map((node) => node.id);
      }
      return jsonGraph;
    }
    const graph = await this.generateGraphFromRemote(remote!, id);
    return GraphLib.json.write(graph);
  }

  /**
   *
   * @returns Workspace if it exists, otherwise undefined.
   * the reason to not add it here as a type is to avoid circular dependency issues.
   */
  private getWorkspaceIfExist(): any {
    try {
      return this.componentAspect.getHost('teambit.workspace/workspace');
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
