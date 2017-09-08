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
  if (semver.major(remoteVersion) > semver.major(BIT_VERSION)) {
    loader.off();
    console.log(createMajorMessage(remoteVersion, BIT_VERSION)); // eslint-disable-line
    return;
  }

  if (semver.minor(remoteVersion) > semver.minor(BIT_VERSION)) {
    loader.off();
    console.log(createMinorMessage(remoteVersion, BIT_VERSION)); // eslint-disable-line
  }
}
