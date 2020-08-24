import chalk from 'chalk';
import * as semver from 'semver';

import loader from '../../cli/loader/loader';
import { BASE_DOCS_DOMAIN, BIT_VERSION } from '../../constants';
import logger from '../../logger/logger';
import { OldClientVersion } from './exceptions';

const createMajorMessage = (remoteVersion, currentVersion) =>
  chalk.red(
    `Fatal: There is a mismatch between the remote server version - "${remoteVersion}" and your bit version - "${currentVersion}", please update\n`
  );

const createMinorMessage = (remoteVersion, currentVersion) =>
  chalk.yellow(
    `Warning: There is a mismatch between the remote server version - "${remoteVersion}" and your bit version - "${currentVersion}", please update\n`
  );

/**
 * before version 14.x there was no way for the server to throw a custom error regarding the
 * old client version. what we can do is throwing a generic error, which the client will
 * catch as UnexpectedNetworkError. Since the client shows an error itself (see
 * checkVersionCompatibility()) the user will get both errors: checkVersionCompatibility()
 * and checkVersionCompatibilityOnTheServer().
 *
 * Since version 14.x a new Error has created OldClientVersion, when the client uses a version
 * equal or bigger than 14.x it's easier to show the entire error using that class.
 */
const throwErrorFromServerSinceVersion = 14;

export default function checkVersionCompatibility(remoteVersion: string) {
  // In case the client is newer than the server version don't check computability
  // (Should be change in the future, but right now we won't release a client which we don't support
  //  on the server)
  if (semver.gte(BIT_VERSION, remoteVersion)) {
    return;
  }

  const remoteMajor = semver.major(remoteVersion);
  const remoteMinor = semver.minor(remoteVersion);
  const remotePatch = semver.patch(remoteVersion);
  const localMajor = semver.major(BIT_VERSION);
  const localMinor = semver.minor(BIT_VERSION);
  const localPatch = semver.patch(BIT_VERSION);

  if (remoteMajor > localMajor) {
    if (localMajor < throwErrorFromServerSinceVersion) return;
    loader.stop();
    logger.console(createMajorMessage(remoteVersion, BIT_VERSION), 'error');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    loader.start();
    return;
  }

  if (remoteMinor > localMinor) {
    loader.stop();
    logger.console(createMinorMessage(remoteVersion, BIT_VERSION), 'error');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    loader.start();
    return;
  }

  if (remotePatch > localPatch) {
    loader.stop();
    logger.console(createMinorMessage(remoteVersion, BIT_VERSION), 'warn');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    loader.start();
  }
}

/**
 * throw error when the server has a major version bigger than the client.
 *
 * we're trying to be backward compatible whenever possible, however, to be forward compatible
 * is much more difficult.
 * It's safer to not let an old client interact with the server at all than enabling some commands
 * and blocking others per version.
 * Imagine when a migration script is written (e.g. when a model field is changed) and it updates
 * some hashes of the components from the old version. If a client doesn't update its version and
 * is using an old version, the flow will break sooner or later with hash-not-found exception
 */
export function checkVersionCompatibilityOnTheServer(clientVersion: string) {
  const clientMajor = semver.major(clientVersion);
  const localMajor = semver.major(BIT_VERSION);
  const oldClientVersionMessageUntilV14 = `Please update your Bit client.\nFor additional information: https://${BASE_DOCS_DOMAIN}/docs/installation#latest-version`;
  const oldClientVersionMessageAfterV14 = () => `Fatal: Bit client - server version mismatch. Using "${clientVersion}" Local version to communicate with "${BIT_VERSION}" on the Remove Server. Please update your Bit client.
For additional information: https://${BASE_DOCS_DOMAIN}/docs/installation#latest-version`;

  if (localMajor > clientMajor) {
    if (clientMajor >= throwErrorFromServerSinceVersion) {
      // since version 14.x a new Error class has been created "OldClientVersion", use it.
      throw new OldClientVersion(oldClientVersionMessageAfterV14());
    }
    throw new Error(oldClientVersionMessageUntilV14);
  }
}

export function isClientHasVersionBefore(version: string, clientVersion: string) {
  return semver.lt(clientVersion, version);
}
