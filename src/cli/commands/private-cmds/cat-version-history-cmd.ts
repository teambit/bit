import { catVersionHistory, generateVersionHistoryGraph } from '../../../api/scope/lib/cat-version-history';
import VisualDependencyGraph, { GraphConfig } from '../../../scope/graph/vizgraph';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

const colorPerEdgeType = {
  unrelated: 'red',
  squashed: 'blue',
};

export class CatVersionHistoryCmd implements LegacyCommand {
  name = 'cat-version-history [id]';
  description = 'cat version-history object by component-id';
  private = true;
  alias = 'cvh';
  opts = [
    // json is also the default for this command. it's only needed to suppress the logger.console
    ['j', 'json', 'json format'],
    ['g', 'graph', `generate graph image`],
    [
      'p',
      'graph-path <image>',
      'relevant for --graph only. image path and format. use one of the following extensions: [gif, png, svg]',
    ],
    [
      '',
      'layout <name>',
      'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]',
    ],
    ['', 'short-hash', 'relevant for --graph only. show only 9 chars of the hash'],
    [
      '',
      'mark <string>',
      'relevant for --graph only. paint the given node-ids in the graph in red color, for multiple, separate by commas',
    ],
  ] as CommandOptions;

  async action(
    [id]: [string],
    {
      graph,
      mark,
      graphPath,
      layout,
      shortHash,
    }: {
      graph: boolean;
      mark?: string;
      graphPath?: string;
      layout?: string;
      shortHash?: boolean;
    }
  ): Promise<any> {
    if (graph) {
      const graphHistory = await generateVersionHistoryGraph(id, shortHash);
      const markIds = mark ? mark.split(',').map((node) => node.trim()) : undefined;
      const config: GraphConfig = { colorPerEdgeType };
      if (layout) config.layout = layout;
      const visualDependencyGraph = await VisualDependencyGraph.loadFromClearGraph(graphHistory, config, markIds);
      const result = await visualDependencyGraph.image(graphPath);
      return `image created at ${result}`;
    }
    return catVersionHistory(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
