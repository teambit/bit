import gitconfig from 'gitconfig';
import fs from 'fs-extra';
import yn from 'yn';

import * as globalConfig from '../../api/consumer/lib/global-config';
import {
  CFG_REPOSITORY_REPORTING_KEY,
  CFG_SSH_KEY_FILE_KEY,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  CFG_USER_TOKEN_KEY,
  DEFAULT_SSH_KEY_FILE,
} from '../../constants';
import logger from '../../logger/logger';

/**
 * Add more keys to the context which will be passed to hooks
 * @param {Object} context
 */
export default function enrichContextFromGlobal(context: Record<string, any> = {}) {
  logger.debug('enrich context from global config');
  const getContextToEnrich = () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!enrichContextFromGlobal.context) {
      const username = globalConfig.getSync(CFG_USER_NAME_KEY);
      const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);
      const sshKeyFile = globalConfig.getSync(CFG_SSH_KEY_FILE_KEY);
      const token = globalConfig.getSync(CFG_USER_TOKEN_KEY);
      const pubSshKeyFile = sshKeyFile ? `${sshKeyFile}.pub` : undefined;
      const pubSshKey = _getSshPubKey(pubSshKeyFile);
      const repo = yn(globalConfig.getSync(CFG_REPOSITORY_REPORTING_KEY), { default: true })
        ? gitconfig.fetchRepo()
        : undefined;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      enrichContextFromGlobal.context = { username, email, pubSshKey, token, repo };
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return enrichContextFromGlobal.context;
  };
  const contextToEnrich = getContextToEnrich();
  Object.assign(context, contextToEnrich);
}

function _getSshPubKey(pubSshKeyFile = `${DEFAULT_SSH_KEY_FILE}.pub`) {
  logger.debug(`reading ssh public key from ${pubSshKeyFile}`);
  if (!fs.pathExistsSync(pubSshKeyFile)) {
    return null;
  }
  const buf = fs.readFileSync(pubSshKeyFile);
  return buf.toString();
}
