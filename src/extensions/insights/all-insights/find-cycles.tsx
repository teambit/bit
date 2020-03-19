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

  _renderData(data: any) {
    if (data.data.length === 0) {
      return (
        <Box textWrap="wrap" height={1} key="num_results">
          No cyclic dependencies
        </Box>
      );
    }
    return (
      <Box textWrap="wrap" key="find_cycles">
        <Box key="data" height={1}>
          <Box textWrap="wrap" height={1}>
            {data.message}
          </Box>
          <Box textWrap="wrap" height={1}>
            {data.data}
          </Box>
        </Box>
      </Box>
    );
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this._runInsight();
    const renderedData = this._renderData(bareResult);
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
