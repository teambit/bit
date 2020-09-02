import semver from 'semver';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import packageFile from '../../../package.json';
import { BIT_VERSION } from '../../constants';
import npmClient from '../../npm-client';
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
    your version: ${BIT_VERSION}
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    latest version: ${bareResult.data.latestVersion}`;
  }

  _formatManualTreat(bareResult: ExamineBareResult) {
    if (!bareResult.data) throw new Error('ValidateBitVersion, bareResult.data is missing');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!bareResult.data.latestVersion) {
      return 'please make sure you have an internet connection';
    }
    return 'please upgrade your bit version';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const bitLatestVersion = await npmClient.getPackageLatestVersion(packageFile.name);
    const bitCurrentVersion = BIT_VERSION;
    if (bitLatestVersion) {
      if (semver.lt(bitCurrentVersion, bitLatestVersion)) {
        return {
          valid: false,
          data: {
            latestVersion: bitLatestVersion,
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
