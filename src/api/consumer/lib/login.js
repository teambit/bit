/** @flow */
import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(
  port: string,
  noLaunchBrowser?: boolean
): Promise<{ isAlreadyLoggedIn?: boolean, username?: string }> {
  return loginToBitSrc(port, noLaunchBrowser);
});
