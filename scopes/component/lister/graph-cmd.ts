import chalk from 'chalk';
import os from 'os';
import * as path from 'path';
import GraphLib from 'graphlib';
import { Command, CommandOptions } from '@teambit/cli';
import { generateRandomStr } from '@teambit/legacy/dist/utils';
import VisualDependencyGraph from '@teambit/legacy/dist/scope/graph/vizgraph';
import { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy/dist/bit-id';
import { ListerMain } from './lister.main.runtime';

type GraphOpt = {
  image?: string;
  remote?: string;
  allVersions?: boolean;
  layout?: string;
  json?: boolean;
};

export class GraphCmd implements Command {
  name = 'graph [id]';
  description = 'EXPERIMENTAL. generate an image file with the dependencies graph';
  group = 'discover';
  alias = '';
  options = [
    ['i', 'image <image>', 'image path. use one of the following extensions: [gif, png, svg, pdf]'],
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

  constructor(private lister: ListerMain, private workspace?: Workspace) {}

  async report([id]: [string], { remote, allVersions, layout, image }: GraphOpt): Promise<string> {
    const graph = await this.lister.generateGraph(id, remote, allVersions);

    const config = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (layout) config.layout = layout;
    const visualDependencyGraph = await VisualDependencyGraph.loadFromGraphlib(graph, config);

    const getBitId = (): BitId | undefined => {
      if (!id) return undefined;
      if (remote) return BitId.parse(id, true); // user used --remote so we know it has a scope
      return this.workspace?.consumer.getParsedId(id);
    };
    const bitId = getBitId();

    if (bitId) {
      visualDependencyGraph.highlightId(bitId);
    }
    image = image || path.join(os.tmpdir(), `${generateRandomStr()}.png`);
    const result = await visualDependencyGraph.image(image);

    return chalk.green(`image created at ${result}`);
  }

  async json([id]: [string], { remote, allVersions }: GraphOpt) {
    const graph = await this.lister.generateGraph(id, remote, allVersions);
    return GraphLib.json.write(graph);
  }
}
