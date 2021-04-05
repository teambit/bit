/* eslint-disable @typescript-eslint/no-unused-vars */
import { GraphBuilder, VersionSubgraph } from '@teambit/graph';

import { Insight, InsightResult, RawResult } from '../insight';
// import NoDataForInsight from '../exceptions/no-data-for-insight';

export const INSIGHT_NAME = 'duplicate dependencies';

type Dependent = {
  id: string;
  usedVersion: string;
};

type FormattedEntry = {
  dependencyId: string;
  latestVersion: string;
  dependents: {
    id: string;
    usedVersion: string;
  }[];
};
export default class DuplicateDependencies implements Insight {
  name = INSIGHT_NAME;
  description = 'Get all duplicate dependencies in component graph';
  graphBuilder: GraphBuilder;
  constructor(graphBuilder: GraphBuilder) {
    this.graphBuilder = graphBuilder;
  }
  private async runInsight(): Promise<RawResult> {
    const graph = await this.graphBuilder.getGraph();
    if (!graph) {
      return {
        message: 'No graph found',
        data: undefined,
      };
    }
    const duplicates = graph.findDuplicateDependencies();
    const lenDependencies = [...duplicates.keys()].length;
    if (lenDependencies === 1) {
      return {
        message: `Found ${lenDependencies} duplicate dependency.`,
        data: duplicates,
      };
    }
    return {
      message: `Found ${lenDependencies} duplicate dependencies.`,
      data: duplicates,
    };
  }

  private formatData(data: any): FormattedEntry[] {
    const formatted: FormattedEntry[] = [];
    for (const [dependency, depData] of data.entries()) {
      const dependents: Dependent[] = this.getDependents(depData.priorVersions);
      formatted.push({
        dependencyId: dependency,
        latestVersion: depData.latestVersionId,
        dependents,
      });
    }
    return formatted;
  }

  private getDependents(priorVersions: VersionSubgraph[]): Dependent[] {
    const dependents: Dependent[] = [];
    priorVersions.forEach((pVersion: VersionSubgraph) => {
      pVersion.immediateDependents.forEach((dependent: string) => {
        dependents.push({
          id: dependent,
          usedVersion: pVersion.versionId,
        });
      });
    });
    return dependents;
  }

  private renderDependents(dependents: { id: string; usedVersion: string }[]): string {
    const string = dependents
      .map((dependent) => {
        return `- ${dependent.id} => ${dependent.usedVersion}`;
      })
      .join('\n');
    return string;
  }

  private renderData(data: FormattedEntry[]) {
    const string = data
      .map((obj) => {
        return `\nDuplicate dependency
--------------------
Dependency: ${obj.dependencyId}
Dependents:
${this.renderDependents(obj.dependents)}`;
      })
      .join('\n');
    return string;
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this.runInsight();
    const formattedData = this.formatData(bareResult.data);
    const renderedData = this.renderData(formattedData);
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
}
