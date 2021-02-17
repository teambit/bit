import getCredentialsByURI from 'credentials-by-uri';
import { RegistriesMap } from '@teambit/dependency-resolver';
import { stripTrailingChar } from '@teambit/legacy/dist/utils';
import { isEmpty } from 'ramda';
import toNerfDart from 'nerf-dart';
import { readConfig } from './read-config';

type OriginalAuthConfig = {
  originalAuthType: string;
  originalAuthValue: string;
};

export async function getRegistries(): Promise<RegistriesMap> {
  const config = await readConfig();
  const registriesMap: RegistriesMap = {};

  Object.keys(config.config.registries).forEach((regName) => {
    const uri = config.config.registries[regName];
    let credentials = getCredentialsByURI(config.config.rawConfig, uri);
    let originalAuthConfig = getOriginalAuthConfigByUri(config.config.rawConfig, uri);
    if (isEmpty(credentials)) {
      credentials = getCredentialsByURI(config.config.rawConfig, switchTrailingSlash(uri));
      originalAuthConfig = getOriginalAuthConfigByUri(config.config.rawConfig, switchTrailingSlash(uri));
    }
    registriesMap[regName] = {
      uri,
      alwaysAuth: !!credentials.alwaysAuth,
      authHeaderValue: credentials.authHeaderValue,
      ...originalAuthConfig,
    };
  });
  return registriesMap;
}

// based on https://github.com/pnpm/credentials-by-uri/blob/master/index.js
function getOriginalAuthConfigByUri(config: Record<string, any>, uri: string): OriginalAuthConfig {
  const nerfed = toNerfDart(uri);
  const defnerf = toNerfDart(config.registry);

  const creds = getScopedCredentials(nerfed, `${nerfed}:`, config);
  if (nerfed !== defnerf) return creds;
  const defaultCredentials = getScopedCredentials(nerfed, '', config);
  return {
    originalAuthType: creds.originalAuthType || defaultCredentials.originalAuthType,
    originalAuthValue: creds.originalAuthValue || defaultCredentials.originalAuthValue,
  };
}

function getScopedCredentials(nerfed: string, scope: string, config: Record<string, any>): OriginalAuthConfig {
  const token = config[`${scope}_authToken`];
  // Check for bearer token
  if (token) {
    return {
      originalAuthType: `authToken`,
      originalAuthValue: token,
    };
  }

  const auth = config[`${scope}_auth`];

  // Check for basic auth token
  if (auth) {
    return {
      originalAuthType: `auth`,
      originalAuthValue: auth,
    };
  }

  // Check for username/password auth
  let username;
  let password;
  if (config[`${scope}username`]) {
    username = config[`${scope}username`];
  }
  if (config[`${scope}_password`]) {
    if (scope === '') {
      password = config[`${scope}_password`];
    } else {
      password = Buffer.from(config[`${scope}_password`], 'base64').toString('utf8');
    }
  }

  if (username && password) {
    return {
      originalAuthType: `user-pass`,
      originalAuthValue: `${username}:${password}`,
    };
  }

  return {
    originalAuthType: '',
    originalAuthValue: '',
  };
}

function switchTrailingSlash(uri: string): string {
  if (!uri.endsWith('/')) {
    return `${uri}/`;
  }
  return stripTrailingChar(uri, '/');
}
