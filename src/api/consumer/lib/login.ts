import loginToCloud from '../../../consumer/login/login';

export default (async function loginAction(
  port: string,
  suppressBrowserLaunch: boolean,
  npmrcPath: string,
  skipRegistryConfig: boolean,
  machineName: string | null | undefined,
  cloudDomain?: string
): Promise<{ isAlreadyLoggedIn?: boolean; username?: string; npmrcPath?: string }> {
  return loginToCloud(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig, machineName, cloudDomain);
});
