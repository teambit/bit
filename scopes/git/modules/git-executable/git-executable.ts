import { getConfig } from '@teambit/config-store';
import { CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy.constants';

export function getGitExecutablePath() {
  const executablePath = getConfig(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}
