import getCredentialsByURI from 'credentials-by-uri';
import { RegistriesMap } from '@teambit/dependency-resolver';
import { stripTrailingChar } from 'bit-bin/dist/utils';
import { isEmpty } from 'ramda';
import { readConfig } from './read-config';

export async function getRegistries(): Promise<RegistriesMap> {
  const config = await readConfig();
  const registriesMap: RegistriesMap = {};
  Object.keys(config.config.registries).forEach((regName) => {
    const uri = config.config.registries[regName];
    let credentials = getCredentialsByURI(config.config.rawConfig, uri);
    if (isEmpty(credentials)) {
      credentials = getCredentialsByURI(config.config.rawConfig, switchTrailingSlash(uri));
    }
    registriesMap[regName] = {
      uri,
      alwaysAuth: !!credentials.alwaysAuth,
      authHeaderValue: credentials.authHeaderValue,
    };
  });
  return registriesMap;
}

function switchTrailingSlash(uri: string): string {
  if (!uri.endsWith('/')) {
    return `${uri}/`;
  }
  return stripTrailingChar(uri, '/');
}
