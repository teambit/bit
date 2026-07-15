import type { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import type { Config } from '@pnpm/config.reader';

export function getProxyConfig(config: Config): PackageManagerProxyConfig {
  const httpProxy = config.httpProxy;
  const httpsProxy = config.httpsProxy || httpProxy;
  const authConfig = config.authConfig as Record<string, string | boolean | undefined>;
  const rawConfig = (config as Config & { rawConfig?: Record<string, string | boolean | undefined> }).rawConfig;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
    noProxy:
      config.noProxy ?? authConfig['no-proxy'] ?? authConfig.noproxy ?? rawConfig?.['no-proxy'] ?? rawConfig?.noproxy,
  };
  return proxyConfig;
}

export type ProxyConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: boolean | string;
};
