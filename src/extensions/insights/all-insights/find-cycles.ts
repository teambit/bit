import Insight, { InsightResult, BareResult } from '../insight';
import { ComponentGraph } from '../../graph/component-graph';

export const INSIGHT_NAME = 'Find cyclic dependencies';

export default class FindCycles extends Insight {
  name = INSIGHT_NAME;
  description = 'Get all cyclic dependencies in component graph';

  async _runInsight(graph: ComponentGraph): Promise<BareResult> {
    throw new Error('You must implement this method');
  }

  _formatData(data: any): string {
    throw new Error('You must implement this method');
  }

  runInsight(str: string, num: number): Promise<InsightResult> {
    return {};
  }

  // _formatSymptoms(bareResult: ExamineBareResult): string {
  //   if (!bareResult.data) throw new Error('BrokenSymlinkFiles, bareResult.data is missing');
  //   // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  //   const toString = bareResult.data.brokenSymlinks
  //     .map(brokenSymlink => `symlink path: "${brokenSymlink.symlinkPath}", broken link: "${brokenSymlink.brokenPath}"`)
  //     .join('\n');
  //   return `the following symlinks points to non-existing paths\n${toString}`;
  // }

  // async _runExamine(): Promise<ExamineBareResult> {
  //   const consumer = await loadConsumer();
  //   const envComponentsDir = path.join(consumer.scope.getPath(), Scope.getComponentsRelativePath());
  //   const potentialSymlinks = glob.sync('**/node_modules/@bit/**', { cwd: envComponentsDir });
  //   const potentialSymlinksAbs = potentialSymlinks.map(p => path.join(envComponentsDir, p));
  //   const brokenSymlinks: BrokenSymlink[] = [];
  //   const results = potentialSymlinksAbs.map(async potentialSymlink => {
  //     const link = await this._getLinkIfExist(potentialSymlink);
  //     if (!link) return;
  //     const exists = await fs.pathExists(link);
  //     if (exists) return;
  //     const brokenSymlink = {
  //       symlinkPath: potentialSymlink,
  //       brokenPath: link,
  //       pathToDelete: this._getPathToDelete(potentialSymlink)
  //     };
  //     brokenSymlinks.push(brokenSymlink);
  //   });
  //   await Promise.all(results);
  //   return {
  //     valid: brokenSymlinks.length === 0,
  //     data: {
  //       brokenSymlinks
  //     }
  //   };
  // }
}
