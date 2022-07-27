import semver from 'semver';
import { listRemote } from '@teambit/bvm.list';
import { getHarmonyVersion } from '../../bootstrap';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

export default class ValidateBitVersion extends Diagnosis {
  name = 'validate bit version';
  description = 'validate that bit version is up to date';
  category = 'core';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    if (!bareResult.data) throw new Error('ValidateBitVersion, bareResult.data is missing');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!bareResult.data.latestVersion) {
      return 'could not fetch bit latest version';
    }
    return `bit is not up to date.
  your version: ${bareResult.data.currentVersion}
  latest version: ${bareResult.data.latestVersion}`;
  }

  _formatManualTreat(bareResult: ExamineBareResult) {
    if (!bareResult.data) throw new Error('ValidateBitVersion, bareResult.data is missing');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!bareResult.data.latestVersion) {
      return 'please make sure you have an internet connection';
    }
    return 'please upgrade your bit version (bvm upgrade)';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const bitRemoteVersionOnBvm = await listRemote({ limit: 1 });
    const bitLatestVersion = bitRemoteVersionOnBvm.entries[0].version;
    const bitCurrentVersion = getHarmonyVersion(true);
    if (bitLatestVersion) {
      if (semver.lt(bitCurrentVersion, bitLatestVersion)) {
        return {
          valid: false,
          data: {
            latestVersion: bitLatestVersion,
            currentVersion: bitCurrentVersion,
          },
        };
      }
      return {
        valid: true,
      };
    }
    return {
      valid: false,
      data: {
        latestVersion: null,
      },
    };
  }
}
