import { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import { Config } from '@pnpm/config';

export function getProxyConfig(config: Config): PackageManagerProxyConfig {
  const httpProxy = config.httpProxy;
  const httpsProxy = config.httpsProxy || httpProxy;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
    noProxy: config.rawConfig.noproxy,
  };
  return proxyConfig;
}

export type ProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: boolean | string;
};
