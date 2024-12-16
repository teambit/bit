import { getSync } from '@teambit/legacy.global-config';
import { CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy.constants';

export function getGitExecutablePath() {
  const executablePath = getSync(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}
