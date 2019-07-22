/** @flow */
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import R from 'ramda';
import Diagnosis from '../diagnosis';
import type { ExamineBareResult } from '../diagnosis';
import { loadConsumer } from '../../consumer';
import { Scope } from '../../scope';

type BrokenSymlink = { symlinkPath: string, brokenPath: string, pathToDelete: string };
export const DIAGNOSIS_NAME = 'check environment symlinks';

export default class BrokenSymlinkFiles extends Diagnosis {
  name = DIAGNOSIS_NAME;
  description = 'validate generated symlinks for workspace environments';
  category = 'local environments';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    if (!bareResult.data) throw new Error('BrokenSymlinkFiles, bareResult.data is missing');
    const toString = bareResult.data.brokenSymlinks
      .map(brokenSymlink => `symlink path: "${brokenSymlink.symlinkPath}", broken link: "${brokenSymlink.brokenPath}"`)
      .join('\n');
    return `the following symlinks points to non-existing paths\n${toString}`;
  }

  _formatManualTreat(bareResult: ExamineBareResult) {
    if (!bareResult.data) throw new Error('BrokenSymlinkFiles, bareResult.data is missing');
    const toString = R.uniq(bareResult.data.brokenSymlinks.map(b => b.pathToDelete)).join('\n');
    return `please delete the following paths:\n${toString}`;
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const consumer = await loadConsumer();
    const envComponentsDir = path.join(consumer.scope.getPath(), Scope.getComponentsRelativePath());
    const potentialSymlinks = glob.sync('**/node_modules/@bit/**', { cwd: envComponentsDir });
    const potentialSymlinksAbs = potentialSymlinks.map(p => path.join(envComponentsDir, p));
    const brokenSymlinks: BrokenSymlink[] = [];
    const results = potentialSymlinksAbs.map(async (potentialSymlink) => {
      const link = await this._getLinkIfExist(potentialSymlink);
      if (!link) return;
      const exists = await fs.exists(link);
      if (exists) return;
      const brokenSymlink = {
        symlinkPath: potentialSymlink,
        brokenPath: link,
        pathToDelete: this._getPathToDelete(potentialSymlink)
      };
      brokenSymlinks.push(brokenSymlink);
    });
    await Promise.all(results);
    return {
      valid: brokenSymlinks.length === 0,
      data: {
        brokenSymlinks
      }
    };
  }

  async _getLinkIfExist(symlinkPath: string): Promise<?string> {
    try {
      const link = await fs.readlink(symlinkPath);
      return link;
    } catch (err) {
      // probably not a symlink
      return null;
    }
  }

  /**
   * deleting the environment directory causes Bit to reinstall it next time
   */
  _getPathToDelete(symlinkPath: string): string {
    const envDirectory = symlinkPath.split(path.join('node_modules', '@bit'))[0];
    return envDirectory.slice(0, -1); // remove the last slash
  }
}
