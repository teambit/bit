/** @flow */
import fs from 'fs-extra';
import * as globalConfig from '../../api/consumer/lib/global-config';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY, CFG_SSH_KEY_FILE_KEY, DEFAULT_SSH_KEY_FILE } from '../../constants';

/**
 * Add more keys to the context which will be passed to hooks
 * @param {Object} context
 */
export default function enrichContextFromGlobal(context: Object = {}) {
  const username = globalConfig.getSync(CFG_USER_NAME_KEY);
  const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);
  const sshKeyFile = globalConfig.getSync(CFG_SSH_KEY_FILE_KEY);
  const pubSshKeyFile = sshKeyFile ? `${sshKeyFile}.pub` : '';
  const pubSshKey = _getSshPubKey(pubSshKeyFile);
  Object.assign(context, { username, email, pubSshKey });
}

function _getSshPubKey(pubSshKeyFile: string = `${DEFAULT_SSH_KEY_FILE}.pub`) {
  const buf = fs.readFileSync(pubSshKeyFile);
  return buf.toString();
}
