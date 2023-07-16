import { catVersionHistory, generateVersionHistoryGraph } from '../../../api/scope/lib/cat-version-history';
import VisualDependencyGraph from '../../../scope/graph/vizgraph';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

const colorPerEdgeType = {
  parent: 'green',
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
    ['g', 'graph', `generate graph image (arrows color: ${JSON.stringify(colorPerEdgeType)})`],
  ] as CommandOptions;

  async action([id]: [string], { graph }: { graph: boolean }): Promise<any> {
    if (graph) {
      const graphHistory = await generateVersionHistoryGraph(id);
      const visualDependencyGraph = await VisualDependencyGraph.loadFromClearGraph(graphHistory, {
        colorPerEdgeType,
      });
      const result = await visualDependencyGraph.image();
      return `image created at ${result}`;
    }
    return catVersionHistory(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
