import { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import { readConfig } from './read-config';

export async function getProxyConfig(): Promise<PackageManagerProxyConfig> {
  const config = await readConfig();
  const httpProxy = config.config.httpProxy;
  const httpsProxy = config.config.httpsProxy || httpProxy;
  const proxyConfig: PackageManagerProxyConfig = {
    httpProxy,
    httpsProxy,
    ca: config.config.ca,
    cert: config.config.cert,
    key: config.config.key,
    noProxy: config.config.rawConfig.noproxy,
    strictSSL: config.config.strictSsl,
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
