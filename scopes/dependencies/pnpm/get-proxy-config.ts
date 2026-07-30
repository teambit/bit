import type { PackageManagerProxyConfig } from '@teambit/dependency-resolver';
import type { ResolvedConfig } from '@pnpm/napi';

export function getProxyConfig(config: ResolvedConfig): PackageManagerProxyConfig {
  return {
    httpProxy: config.httpProxy,
    httpsProxy: config.httpsProxy ?? config.httpProxy,
    noProxy: config.noProxy,
  };
}
