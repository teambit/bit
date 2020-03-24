import React from 'react';
import { Color, Box, Text, render } from 'ink';
import { Insight, InsightResult, RawResult } from '../insight';
import { ComponentGraph } from '../../graph/component-graph';
import { VersionSubgraph } from '../../graph/duplicate-dependency';

export const INSIGHT_NAME = 'duplicateDependencies';

type Dependent = {
  id: string;
  usedVersion: string;
};

type FormattedEntry = {
  dependencyId: string;
  latestVersion: string;
  dependents: Dependent[];
};
export default class DuplicateDependencies implements Insight {
  name = INSIGHT_NAME;
  description = 'Get all duplicate dependencies in component graph';
  graph: ComponentGraph;
  constructor(graph: ComponentGraph) {
    this.graph = graph;
  }
  async _runInsight(): Promise<RawResult> {
    const duplicates = this.graph.findDuplicateDependencies();
    return {
      message: `Found ${[...duplicates.keys()].length} duplicate dependencies.`,
      data: duplicates
    };
  }

  _formatData(data: any): FormattedEntry[] {
    let formatted: FormattedEntry[] = [];
    for (const [dependency, depData] of data.entries()) {
      const dependents: Dependent[] = this._getDependents(depData.priorVersions);
      formatted.push({
        dependencyId: dependency,
        latestVersion: depData.latestVersionId,
        dependents: dependents
      });
    }
    return formatted;
  }

  _getDependents(priorVersions: VersionSubgraph[]): Dependent[] {
    let dependents: Dependent[] = [];
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
                    <Text key={dependent.id}>
                      {'  '}
                      <Color blue>{alignCommandName(dependent.id)}</Color>
                      {dependent.usedVersion}
                    </Text>
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

function alignCommandName(name: string, sizeToAlign = 20) {
  return `${name}${new Array(sizeToAlign).join(' ')}`;
}
