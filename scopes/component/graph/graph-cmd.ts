import chalk from 'chalk';
import os from 'os';
import * as path from 'path';
import GraphLib from 'graphlib';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DependencyGraph, VisualDependencyGraph } from '@teambit/legacy.dependency-graph';
import { getRemoteByName } from '@teambit/scope.remotes';
import { ComponentMain } from '@teambit/component';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';

type GraphOpt = {
  image?: string;
  remote?: string;
  allVersions?: boolean;
  layout?: string;
  json?: boolean;
};

export class GraphCmd implements Command {
  name = 'graph [id]';
  description = "generate an image file with the workspace components' dependencies graph";
  extendedDescription: 'black arrow is a runtime dependency. red arrow is either dev or peer';
  group = 'discover';
  alias = '';
  options = [
    ['i', 'image <image>', 'image path and format. use one of the following extensions: [gif, png, svg, pdf]'],
    ['r', 'remote [remoteName]', 'remote name (name is optional, leave empty when id is specified)'],
    ['', 'all-versions', 'enter all components versions into the graph, not only latest'],
    [
      '',
      'layout <name>',
      'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  remoteOp = true;

  constructor(private componentAspect: ComponentMain) {}

  async report([id]: [string], { remote, allVersions, layout, image }: GraphOpt): Promise<string> {
    const workspace = this.componentAspect.getHost('teambit.workspace/workspace') as Workspace;
    if (!workspace && !remote) throw new OutsideWorkspaceError();

    const graph = await this.generateGraph(workspace, id, remote, allVersions);

    const config = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (layout) config.layout = layout;
    const visualDependencyGraph = await VisualDependencyGraph.loadFromGraphlib(graph, config);

    image = image || path.join(os.tmpdir(), `${generateRandomStr()}.png`);
    const result = await visualDependencyGraph.image(image);

    return chalk.green(`image created at ${result}`);
  }

  private async generateGraph(
    workspace?: Workspace,
    id?: string,
    remote?: string,
    allVersions?: boolean
  ): Promise<GraphLib.Graph> {
    if (!workspace && !remote) throw new OutsideWorkspaceError();
    const getBitId = (): ComponentID | undefined => {
      if (!id) return undefined;
      if (remote) return ComponentID.fromString(id); // user used --remote so we know it has a scope
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return consumer.getParsedId(id);
    };
    const bitId = getBitId();
    if (remote) {
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

    const onlyLatest = !allVersions;
    // @ts-ignore workspace must be set here
    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(workspace, onlyLatest);
    const dependencyGraph = new DependencyGraph(workspaceGraph);
    if (id) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      const componentDepGraph = new DependencyGraph(componentGraph);
      return componentDepGraph.graph;
    }
    return dependencyGraph.graph;
  }

  async json([id]: [string], { remote, allVersions }: GraphOpt) {
    const workspace = this.componentAspect.getHost('teambit.workspace/workspace') as Workspace;
    if (!workspace && !remote) throw new OutsideWorkspaceError();

    const graph = await this.generateGraph(workspace, id, remote, allVersions);
    return GraphLib.json.write(graph);
  }
}
