import { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import { Config } from '@pnpm/config'

export function getProxyConfig(config: Config): PackageManagerProxyConfig {
  const httpProxy = config.httpProxy;
  const httpsProxy = config.httpsProxy || httpProxy;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
    ca: config.ca,
    cert: config.cert,
    key: config.key,
    noProxy: config.rawConfig.noproxy,
    strictSSL: config.strictSsl,
  };
  return proxyConfig;
}

export type ProxyConfig = {
  ca?: string;
  cert?: string;
  httpProxy?: string;
  httpsProxy?: string;
  key?: string;
  noProxy?: boolean | string;
  strictSSL?: boolean;
};
