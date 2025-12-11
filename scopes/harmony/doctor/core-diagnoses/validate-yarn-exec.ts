import execa from 'execa';
import { logger } from '@teambit/legacy.logger';
import type { ExamineBareResult } from '../diagnosis';
import Diagnosis from '../diagnosis';

export default class ValidateYarnExec extends Diagnosis {
  name = 'validate yarn exec';
  description = 'validate that yarn executable found';
  category = 'vendors';

  _formatSymptoms(): string {
    return 'yarn executable not found';
  }

  _formatManualTreat() {
    return 'please ensure yarn is installed';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const yarnVersion = await getYarnVersion();
    if (yarnVersion) {
      return {
        valid: true,
      };
    }
    return {
      valid: false,
      data: {},
    };
  }
}

export async function getYarnVersion(): Promise<string | null | undefined> {
  try {
    const { stdout } = await execa('yarn', ['-v']);
    return stdout;
  } catch (e: any) {
    logger.debugAndAddBreadCrumb('npm-client', `can't find yarn version by running yarn -v. ${e.message}`);
  }
  return null;
}
