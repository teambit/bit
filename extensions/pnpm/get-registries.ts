import getCredentialsByURI from 'credentials-by-uri';
import { RegistriesMap } from '@teambit/dependency-resolver';
import {readConfig} from './read-config';


export async function getRegistries(): Promise<RegistriesMap> {
  const config = await readConfig();
  const registriesMap: RegistriesMap = {};
  Object.keys(config.config.registries).forEach((regName) => {
    const uri = config.config.registries[regName];
    const credentials = getCredentialsByURI(config.config.rawConfig, uri);
    registriesMap[regName] = {
      uri,
      alwaysAuth: !!credentials.alwaysAuth,
      authHeaderValue: credentials.authHeaderValue,
    };
  });
  return registriesMap;
}
