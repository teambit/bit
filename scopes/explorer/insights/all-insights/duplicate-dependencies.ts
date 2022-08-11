/* eslint-disable @typescript-eslint/no-unused-vars */
import { GraphBuilder, VersionSubgraph } from '@teambit/graph';
import { rcompare } from 'semver';
// import { ComponentID } from '../../../component/component-id';
import { ComponentID } from '@teambit/component';
import { Insight, InsightResult, RawResult } from '../insight';
// import NoDataForInsight from '../exceptions/no-data-for-insight';

export const INSIGHT_NAME = 'duplicate dependencies';

type Dependent = {
  id: string;
  usedVersion: string;
};

type VersionWithDependents = {
  version: string;
  compId: string;
  dependents: Dependent[];
};

type FormattedEntry = {
  dependencyId: string;
  latestVersion: string;
  totalOutdatedDependents: string;
  dependentsByVersion: VersionWithDependents[];
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
      const { totalOutdatedDependents, dependentsByVersion } = this.getDependents(depData.priorVersions);
      formatted.push({
        dependencyId: dependency,
        latestVersion: depData.latestVersionId,
        totalOutdatedDependents: totalOutdatedDependents.toString(),
        dependentsByVersion,
      });
    }
    return formatted;
  }

  private getDependents(priorVersions: VersionSubgraph[]): {
    totalOutdatedDependents: number;
    dependentsByVersion: VersionWithDependents[];
  } {
    let totalOutdatedDependents = 0;
    const dependentsByVersion: VersionWithDependents[] = [];
    priorVersions.forEach((pVersion: VersionSubgraph) => {
      const dependents: Dependent[] = [];
      const version = ComponentID.fromString(pVersion.versionId).version || pVersion.versionId.split('@')[1];
      pVersion.immediateDependents.forEach((dependent: string) => {
        dependents.push({
          id: dependent,
          usedVersion: pVersion.versionId,
        });
      });
      dependentsByVersion.push({
        compId: pVersion.versionId,
        version,
        dependents,
      });
      totalOutdatedDependents += pVersion.immediateDependents.length;
    });
    dependentsByVersion.sort(this.revreseCompareVersions);
    return { totalOutdatedDependents, dependentsByVersion };
  }

  revreseCompareVersions(v1: VersionWithDependents, v2: VersionWithDependents) {
    try {
      return rcompare(v1.version, v2.version);
    } catch (err) {
      // in case one of them is a snap
      return 0;
    }
  }

  private stringifyDependents(dependents: Dependent[]): string {
    const string = dependents
      .map((dependent) => {
        return `- ${dependent.id} => ${dependent.usedVersion}`;
      })
      .join('\n');
    return string;
  }

  private stringifyDependentsByVersion(versions: VersionWithDependents[]): string {
    const string = versions
      .map((version) => {
        return `- ${version.compId} has ${version.dependents.length} dependents`;
      })
      .join('\n');
    return string;
  }

  private renderData(data: FormattedEntry[]) {
    const string = data
      .map((obj) => {
        return `\n\nFound ${obj.totalOutdatedDependents} outdated dependents for ${obj.dependencyId}
The latest version is "${obj.latestVersion}"
Outdated dependents:
${this.stringifyDependentsByVersion(obj.dependentsByVersion)}`;
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
      data: formattedData,
      message: bareResult.message,
      renderedData,
    };

    if (bareResult.message) {
      result.message = bareResult.message;
    }
    return result;
  }
}
