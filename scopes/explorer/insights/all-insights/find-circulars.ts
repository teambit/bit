import { Component } from '@teambit/component';
import { IssuesClasses } from '@teambit/component-issues';
import { GraphBuilder } from '@teambit/graph';
import { uniq } from 'lodash';
import { Insight, InsightResult, RawResult } from '../insight';

export const INSIGHT_CIRCULAR_DEPS_NAME = 'circular';

export default class FindCycles implements Insight {
  name = INSIGHT_CIRCULAR_DEPS_NAME;
  description = 'Get all circular dependencies in component graph';
  graphBuilder: GraphBuilder;
  constructor(graphBuilder: GraphBuilder) {
    this.graphBuilder = graphBuilder;
  }
  private async runInsight(): Promise<RawResult> {
    const graph = await this.graphBuilder.getGraphIds();
    if (!graph) {
      return {
        message: '',
        data: undefined,
      };
    }
    const cycles = graph.findCycles();
    if (cycles.length === 1) {
      return {
        message: `Found ${cycles.length} cycle.`,
        data: cycles,
      };
    }
    return {
      message: `Found ${cycles.length} cycles.`,
      data: cycles,
    };
  }

  private renderData(data: RawResult) {
    if (data.data.length === 0) {
      return 'No cyclic dependencies';
    }
    const string = data.data
      .map((cycle) => {
        return `\nCyclic dependency
-----------------
- ${cycle.join('\n- ')}`;
      })
      .join('\n');
    return string;
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this.runInsight();
    const renderedData = this.renderData(bareResult);
    const result: InsightResult = {
      metaData: {
        name: this.name,
        description: this.description,
      },
      data: bareResult.data,
      message: bareResult.message,
      renderedData,
    };

    if (bareResult.message) {
      result.message = bareResult.message;
    }
    return result;
  }

  async addAsComponentIssue(components: Component[]) {
    const result = await this.runInsight();
    if (!result.data.length) {
      return; // no circulars
    }
    const allIds = uniq(result.data.flat());
    const componentsWithCircular = components.filter((component) => allIds.includes(component.id.toString()));
    componentsWithCircular.forEach((component) => {
      component.state.issues.getOrCreate(IssuesClasses.CircularDependencies).data = true;
    });
  }
}
