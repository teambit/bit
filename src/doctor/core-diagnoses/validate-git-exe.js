/** @flow */

import execa from 'execa';
import R from 'ramda';
import Diagnosis from '../diagnosis';
import getGitExecutablePath from '../../utils/git/git-executable';
import type { ExamineBareResult } from '../diagnosis';

export default class ValidateGitExe extends Diagnosis {
  name = 'validate-git-exe';
  description = 'validate that git executable found';
  category = '3rd-parties';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const gitExecutablePath = R.path(['data', 'gitExecutablePath'], bareResult);
    return `git executable not found (on path '${gitExecutablePath}')`;
  }

  _formatManualTreat() {
    return "please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'";
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const gitExecutablePath = getGitExecutablePath();
    try {
      await execa(gitExecutablePath, ['--version']);
      return {
        valid: true
      };
    } catch (err) {
      // if (err.code === 'ENOENT') {
      // }
      return {
        valid: false,
        data: {
          gitExecutablePath
        }
      };
    }
  }
}
