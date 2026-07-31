import type { RegistriesMap } from '@teambit/dependency-resolver';
import type { ResolvedConfig } from '@pnpm/napi';

export function getRegistries(config: ResolvedConfig): RegistriesMap {
  const registriesMap: RegistriesMap = {};
  for (const { name, url, authHeader } of config.registries) {
    registriesMap[name] = {
      uri: url,
      alwaysAuth: !!authHeader,
      authHeaderValue: authHeader,
      ...originalAuthFromHeader(authHeader),
    };
  }
  return registriesMap;
}

/**
 * Reconstruct the npmrc-style credential a header came from, for consumers
 * that regenerate `.npmrc` entries from Bit's registry model: `Bearer` is an
 * `_authToken` credential and `Basic` an `_auth` (base64 `user:password`) one.
 */
function originalAuthFromHeader(authHeader: string | undefined): {
  originalAuthType: string;
  originalAuthValue: string;
} {
  if (authHeader?.startsWith('Bearer ')) {
    return { originalAuthType: 'authToken', originalAuthValue: authHeader.slice('Bearer '.length) };
  }
  if (authHeader?.startsWith('Basic ')) {
    return { originalAuthType: 'auth', originalAuthValue: authHeader.slice('Basic '.length) };
  }
  return { originalAuthType: '', originalAuthValue: '' };
}
