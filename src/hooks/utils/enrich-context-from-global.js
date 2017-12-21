/** @flow */
import * as globalConfig from '../../api/consumer/lib/global-config';
import { CFG_USER_NAME_KEY, CFG_USER_EMAIL_KEY } from '../../constants';

/**
 * Add more keys to the context which will be passed to hooks
 * @param {Object} context
 */
export default function enrichContextFromGlobal(context: Object = {}) {
  const username = globalConfig.getSync(CFG_USER_NAME_KEY);
  const email = globalConfig.getSync(CFG_USER_EMAIL_KEY);
  Object.assign(context, { username, email });
}
