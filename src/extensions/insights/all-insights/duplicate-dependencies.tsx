/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Insight, InsightResult, RawResult } from '../insight';
import { GraphBuilder } from '../../graph';
import { VersionSubgraph } from '../../graph/duplicate-dependency';

export const INSIGHT_NAME = 'duplicateDependencies';

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
    return {
      message: `Found ${[...duplicates.keys()].length} duplicate dependencies.`,
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
      <Box flexDirection="column" key="duplicate_dependencies">
        {data.map(function(mainDependency) {
          return (
            <Box key={mainDependency.dependencyId} flexDirection="column" marginBottom={1}>
              <Text bold underline key={`group_${mainDependency.dependencyId}`}>
                {mainDependency.dependencyId}
              </Text>
              <Box flexDirection="column">
                {mainDependency.dependents.map(function(dependent) {
                  return (
                    <Box flexDirection="column" key={dependent.id}>
                      <Text>
                        {'  '}
                        <Color blue>{alignCommandName(dependent.id)}</Color>
                        {dependent.usedVersion}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
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

function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign).join(' ')}`;
}
