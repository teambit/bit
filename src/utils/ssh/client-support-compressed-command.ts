import semver from 'semver';
import logger from '../../logger/logger';

export function clientSupportCompressedCommand(clientVersion: string) {
  // The compress support released in version 14.6.0, older version doesn't support it
  return clientVersion && semver.gte(clientVersion, '14.6.0');
}
