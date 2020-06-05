/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Insight, InsightResult, RawResult } from '../insight';
import { GraphBuilder, VersionSubgraph } from '../../graph';
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
  async _runInsight(): Promise<RawResult> {
    const graph = await this.graphBuilder.getGraph();
    if (!graph) {
      return {
        message: '',
        data: undefined
      };
    }
    const duplicates = graph.findDuplicateDependencies();
    const lenDependencies = [...duplicates.keys()].length;
    if (lenDependencies === 1) {
      return {
        message: `Found ${lenDependencies} duplicate dependency.`,
        data: duplicates
      };
    }
    return {
      message: `Found ${lenDependencies} duplicate dependencies.`,
      data: duplicates
    };
  }

  _formatData(data: any): FormattedEntry[] {
    const formatted: FormattedEntry[] = [];
    for (const [dependency, depData] of data.entries()) {
      const dependents: Dependent[] = this._getDependents(depData.priorVersions);
      formatted.push({
        dependencyId: dependency,
        latestVersion: depData.latestVersionId,
        dependents
      });
    }
    return formatted;
  }

  _getDependents(priorVersions: VersionSubgraph[]): Dependent[] {
    const dependents: Dependent[] = [];
    priorVersions.forEach((pVersion: VersionSubgraph) => {
      pVersion.immediateDependents.forEach((dependent: string) => {
        dependents.push({
          id: dependent,
          usedVersion: pVersion.versionId
        });
      });
    });
    return dependents;
  }

  _renderData(data: FormattedEntry[]) {
    const element = (
      <div>
        {data.map(function(mainDependency) {
          return (
            <div key={mainDependency.dependencyId}>
              <Text>dependency: {mainDependency.dependencyId}</Text>
              <Text>latest version: {mainDependency.latestVersion}</Text>
              <div>
                <Text>dependents that dont use latest version:</Text>
                {mainDependency.dependents.map(function(dependent) {
                  return (
                    <div key={dependent.id}>
                      <Text>
                        <Color redBright>{dependent.id}</Color> uses <Color redBright>{dependent.usedVersion}</Color>
                      </Text>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
    return element;
  }

  async run(): Promise<InsightResult> {
    const bareResult = await this._runInsight();
    const formattedData = this._formatData(bareResult.data);
    const renderedData = this._renderData(formattedData);
    const result: InsightResult = {
      metaData: {
        name: this.name,
        description: this.description
      },
      data: bareResult.data,
      renderedData
    };

    if (bareResult.message) {
      result.message = bareResult.message;
    }
    return result;
  }
}
