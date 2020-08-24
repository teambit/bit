import npmClient from '../../npm-client';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

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
    const npmVersion = await npmClient.getNpmVersion();
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
