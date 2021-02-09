import { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import { readConfig } from './read-config';

export async function getProxyConfig(): Promise<PackageManagerProxyConfig> {
  const config = await readConfig();
  const httpProxy = config.config.httpProxy;
  const httpsProxy = config.config.httpsProxy || httpProxy;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
  };
  return proxyConfig;
}
