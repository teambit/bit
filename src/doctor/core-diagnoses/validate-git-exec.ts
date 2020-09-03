import execa from 'execa';
import R from 'ramda';

import getGitExecutablePath from '../../utils/git/git-executable';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

export const DIAGNOSIS_NAME = 'validate git exec';
export default class ValidateGitExec extends Diagnosis {
  name = DIAGNOSIS_NAME;
  description = 'validate that git executable found';
  category = 'vendors';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const gitExecutablePath = R.path(['data', 'gitExecutablePath'], bareResult);
    return `git executable not found (path '${gitExecutablePath}')`;
  }

  _formatManualTreat() {
    return "please ensure that git is installed and/or git_path is configured correctly - 'bit config set git_path <GIT_PATH>'";
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const gitExecutablePath = getGitExecutablePath();
    try {
      await execa(gitExecutablePath, ['--version']);
      return {
        valid: true,
      };
    } catch (err) {
      // if (err.code === 'ENOENT') {
      // }
      return {
        valid: false,
        data: {
          gitExecutablePath,
        },
      };
    }
  }
}
