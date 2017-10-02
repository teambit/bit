// @flow
import * as semver from 'semver';
import chalk from 'chalk';
import { BIT_VERSION } from '../../constants';
import loader from '../../cli/loader/loader';

const createMajorMessage = (remoteVersion, currentVersion) =>
  chalk.red(
    `Fatal: There is a mismatch between the remote scope version - "${remoteVersion}" and your bit version - "${currentVersion}", please update\n`
  );

const createMinorMessage = (remoteVersion, currentVersion) =>
  chalk.yellow(
    `Warning: There is a mismatch between the remote scope version - "${remoteVersion}" and your bit version - "${currentVersion}", please update\n`
  );

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
    loader.off();
    console.log(createMajorMessage(remoteVersion, BIT_VERSION)); // eslint-disable-line
    return;
  }

  if (remoteMinor > localMinor) {
    loader.off();
    console.log(createMajorMessage(remoteVersion, BIT_VERSION)); // eslint-disable-line
    return;
  }

  if (remotePatch > localPatch) {
    loader.off();
    console.log(createMinorMessage(remoteVersion, BIT_VERSION)); // eslint-disable-line
  }
}
