import Insight, { InsightResult, BareResult } from '../insight';
import { ComponentGraph } from '../../graph/component-graph';

export const INSIGHT_NAME = 'Find cyclic dependencies';

export default class FindCycles implements Insight {
  name = INSIGHT_NAME;
  description = 'Get all cyclic dependencies in component graph';
  graph: ComponentGraph;
  constructor(graph: ComponentGraph) {
    this.graph = graph;
  }
  async _runInsight(): Promise<BareResult> {
    const cycles = this.graph.findCycles();
    return {
      message: `Found ${cycles.length} cycles.`,
      data: cycles
    };
  }

  _formatData(data: any): string {
    // TODO - implement
    throw new Error('You must implement this method');
  }

  async run(str: string, num: number): Promise<InsightResult> {
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

  // _formatSymptoms(bareResult: ExamineBareResult): string {
  //   if (!bareResult.data) throw new Error('BrokenSymlinkFiles, bareResult.data is missing');
  //   // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  //   const toString = bareResult.data.brokenSymlinks
  //     .map(brokenSymlink => `symlink path: "${brokenSymlink.symlinkPath}", broken link: "${brokenSymlink.brokenPath}"`)
  //     .join('\n');
  //   return `the following symlinks points to non-existing paths\n${toString}`;
  // }
}
