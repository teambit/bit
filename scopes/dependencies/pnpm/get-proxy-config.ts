import type { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import type { Config } from '@pnpm/config.reader';

export function getProxyConfig(config: Config): PackageManagerProxyConfig {
  const httpProxy = config.httpProxy;
  const httpsProxy = config.httpsProxy || httpProxy;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
    noProxy: config.authConfig.noproxy,
  };
  return proxyConfig;
}

export type ProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: boolean | string;
};
