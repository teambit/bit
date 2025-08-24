import execa from 'execa';
import { logger } from '@teambit/legacy.logger';
import type { ExamineBareResult } from '../diagnosis';
import Diagnosis from '../diagnosis';

export default class ValidateNpmExec extends Diagnosis {
  name = 'validate npm exec';
  description = 'validate that npm executable found';
  category = 'vendors';

  _formatSymptoms(): string {
    return 'npm executable not found';
  }

  _formatManualTreat() {
    return 'please ensure npm is installed';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const npmVersion = await getNpmVersion();
    if (npmVersion) {
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

export async function getNpmVersion(): Promise<string | null | undefined> {
  try {
    const { stdout, stderr } = await execa('npm', ['--version']);
    if (stdout && !stderr) return stdout;
  } catch (err: any) {
    logger.debugAndAddBreadCrumb('npm-client', `got an error when executing "npm --version". ${err.message}`);
  }
  return null;
}
