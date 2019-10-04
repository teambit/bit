import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(
  port: string,
  suppressBrowserLaunch: boolean,
  npmrcPath: string,
  skipRegistryConfig: boolean,
  machineName: string | null | undefined
): Promise<{ isAlreadyLoggedIn?: boolean; username?: string; npmrcPath?: string }> {
  return loginToBitSrc(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig, machineName);
});
