import { getSync } from '../../api/consumer/lib/global-config';
import { CFG_GIT_EXECUTABLE_PATH } from '../../constants';

export default function getGitExecutablePath() {
  const executablePath = getSync(CFG_GIT_EXECUTABLE_PATH);
  return executablePath || 'git';
}
