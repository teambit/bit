import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(
  port: string,
  suppressBrowserLaunch: boolean,
  npmrcPath: string,
  skipRegistryConfig: boolean,
  machineName: string | null | undefined,
  hub_domain_login?: string
): Promise<{ isAlreadyLoggedIn?: boolean; username?: string; npmrcPath?: string }> {
  return loginToBitSrc(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig, machineName, hub_domain_login);
});
