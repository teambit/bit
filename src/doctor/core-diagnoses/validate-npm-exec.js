/** @flow */

import execa from 'execa';
import Diagnosis from '../diagnosis';
import type { ExamineBareResult } from '../diagnosis';

export default class ValidateNpmExec extends Diagnosis {
  name = 'validate-npm-exec';
  description = 'validate that npm executable found';
  category = '3rd-parties';

  _formatSymptoms(): string {
    return 'npm executable not found';
  }

  _formatManualTreat() {
    return 'please ensure npm is installed';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    try {
      await execa('npm', ['--version']);
      return {
        valid: true
      };
    } catch (err) {
      return {
        valid: false,
        data: {}
      };
    }
  }
}
