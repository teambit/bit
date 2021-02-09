import { InstallProxyConfig } from '@teambit/dependency-resolver';
import { readConfig } from './read-config';

export async function getProxyConfig(): Promise<InstallProxyConfig> {
  const config = await readConfig();
  const httpProxy = config.config.httpProxy;
  const httpsProxy = config.config.httpsProxy || httpProxy;
  const proxyConfig: InstallProxyConfig = {
    httpProxy,
    httpsProxy,
  };
  return proxyConfig;
}
