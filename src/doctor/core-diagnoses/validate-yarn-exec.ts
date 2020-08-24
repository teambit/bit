import npmClient from '../../npm-client';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

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
    const yarnVersion = await npmClient.getYarnVersion();
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
