import React from 'react';
import { Box } from 'ink';
import { Insight, InsightResult, RawResult } from '../insight';
import { ComponentGraph } from '../../graph/component-graph';

export const INSIGHT_NAME = 'findCycles';

export default class FindCycles implements Insight {
  name = INSIGHT_NAME;
  description = 'Get all cyclic dependencies in component graph';
  graph: ComponentGraph;
  constructor(graph: ComponentGraph) {
    this.graph = graph;
  }
  async _runInsight(): Promise<RawResult> {
    const cycles = this.graph.findCycles();
    if (cycles.length === 1) {
      return {
        message: `Found ${cycles.length} cycle.`,
        data: cycles
      };
    } else {
      return {
        message: `Found ${cycles.length} cycles.`,
        data: cycles
      };
    }
  }

  _formatData(data: any): string {
    return JSON.stringify(data);
  }

  _renderData(data: any) {
    return <Box flexDirection="column" key="find_cycles">results from fc</Box>
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this._runInsight();
    const formattedData = this._formatData(bareResult.data);
    const renderedData = this._renderData(formattedData);
    const result = {
      metaData: {
        name: this.name,
        description: this.description
      },
      data: bareResult.data,
      renderedData: renderedData
    };

    if (!!bareResult.message) {
      result['message'] = bareResult.message;
    }
    return result;
  }
}
