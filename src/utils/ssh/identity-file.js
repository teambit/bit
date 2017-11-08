import { getSync } from '../../api/consumer/lib/global-config';
import { CFG_SSH_KEY_FILE_KEY, DEFAULT_SSH_KEY_FILE } from '../../constants';

export default function getPathToIdentityFile() {
  const identityFile = getSync(CFG_SSH_KEY_FILE_KEY);
  return identityFile || DEFAULT_SSH_KEY_FILE;
}
