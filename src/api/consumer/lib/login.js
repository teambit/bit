/** @flow */
import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(
  port: string,
  suppressBrowserLaunch?: boolean,
  npmrcPath: string,
  skipRegistryConfig: boolean
): Promise<{ isAlreadyLoggedIn?: boolean, username?: string }> {
  return loginToBitSrc(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig);
});
