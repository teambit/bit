import { get } from '../../api/consumer/lib/global-config';
import { CFG_SSH_KEY_FILE_KEY, DEFAULT_SSH_KEY_FILE } from '../../constants';

export default (async function getPathToIdentityFile() {
  const identityFile = await get(CFG_SSH_KEY_FILE_KEY);
  return identityFile || DEFAULT_SSH_KEY_FILE;
});
