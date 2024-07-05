import { getSync } from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy/dist/constants';

export function getGitExecutablePath() {
  const executablePath = getSync(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}
