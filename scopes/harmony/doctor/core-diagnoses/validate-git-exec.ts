import execa from 'execa';
import { getGitExecutablePath } from '@teambit/git.modules.git-executable';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

export const DIAGNOSIS_NAME_VALIDATE_GIT_EXEC = 'validate git exec';
export default class ValidateGitExec extends Diagnosis {
  name = DIAGNOSIS_NAME_VALIDATE_GIT_EXEC;
  description = 'validate that git executable found';
  category = 'vendors';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const gitExecutablePath = bareResult?.data?.gitExecutablePath;
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
    } catch {
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
