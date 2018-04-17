/** @flow */
import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(): Promise<string> {
  return loginToBitSrc();
});
