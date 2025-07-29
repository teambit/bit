import type { Component } from '@teambit/component';
import { IssuesClasses } from '@teambit/component-issues';
import type { GraphMain } from '@teambit/graph';
import { uniq } from 'lodash';
import type { Insight, InsightResult, RawResult } from '../insight';
import type { RunInsightOptions } from '../insight-manager';

export const INSIGHT_CIRCULAR_DEPS_NAME = 'circular';

export default class FindCycles implements Insight {
  name = INSIGHT_CIRCULAR_DEPS_NAME;
  description = 'Get all circular dependencies in component graph';
  graphBuilder: GraphMain;
  constructor(graphBuilder: GraphMain) {
    this.graphBuilder = graphBuilder;
  }
  private async runInsight(opts?: RunInsightOptions): Promise<RawResult> {
    const graph = await this.graphBuilder.getGraphIds(opts?.ids);
    if (!graph) {
      return {
        message: '',
        data: undefined,
      };
    }
    const cycles = graph.findCycles(undefined, opts?.includeDeps);
    // add the first component to the end to make the circular visible in the output
    cycles.forEach((cycle) => cycle.push(cycle[0]));
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

  async run(opts?: RunInsightOptions): Promise<InsightResult> {
    const bareResult = await this.runInsight(opts);
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
    const result = await this.runInsight({ ids: components.map((c) => c.id) });
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
