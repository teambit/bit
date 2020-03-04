import { Insight, InsightResult, RawResult } from '../insight';
import { ComponentGraph } from '../../graph/component-graph';

export const INSIGHT_NAME = 'Find cyclic dependencies';

export default class FindCycles implements Insight {
  name = INSIGHT_NAME;
  description = 'Get all cyclic dependencies in component graph';
  graph: ComponentGraph;
  constructor(graph: ComponentGraph) {
    this.graph = graph;
  }
  async _runInsight(): Promise<RawResult> {
    const cycles = this.graph.findCycles();
    return {
      message: `Found ${cycles.length} cycles.`,
      data: cycles
    };
  }

  _formatData(data: any): string {
    return JSON.stringify(data);
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this._runInsight();
    const formattedData = this._formatData(bareResult.data);
    const result = {
      metaData: {
        name: this.name,
        description: this.description
      },
      data: bareResult.data,
      formattedData: formattedData
    };

    if (!!bareResult.message) {
      result['message'] = bareResult.message;
    }
    return result;
  }
}
