/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path, { join } from 'path';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import execa from 'execa';
import { Logger, LogPublisher } from '../logger';
import { Capsule } from '../isolator';
import { pipeOutput } from '../../utils/child_process';
import createSymlinkOrCopy from '../../utils/fs/create-symlink-or-copy';
import { installOpts } from './types';

export default class PackageManager {
  private emitter = new EventEmitter();
  constructor(readonly packageManagerName: string, readonly logger: Logger) {}

  get name() {
    return this.packageManagerName;
  }
  async checkIfFileExistsInCapsule(capsule: Capsule, file: string) {
    const pathToFile = join(capsule.wrkDir, file);
    try {
      await capsule.fs.promises.access(pathToFile);
      return true;
    } catch (e) {}
    return false;
  }

  async removeLockFilesInCapsule(capsule: Capsule) {
    async function safeUnlink(toRemove: string) {
      try {
        await capsule.fs.promises.unlink(join(capsule.wrkDir, toRemove));
      } catch (e) {}
    }
    await safeUnlink('yarn.lock');
    await safeUnlink('package-lock.json');
  }
  async capsulesInstall(capsules: Capsule[], opts: installOpts = {}) {
    const packageManager = opts.packageManager || this.packageManagerName;
    const logPublisher = this.logger.createLogPublisher('packageManager');
    const longProcessLogger = logPublisher.createLongProcessLogger('installing capsules', capsules.length);
    if (packageManager === 'npm' || packageManager === 'yarn' || packageManager === 'pnpm') {
      // Don't run them in parallel (Promise.all), the package-manager doesn't handle it well.
      await pMapSeries(capsules, async (capsule) => {
        // TODO: remove this hack once harmony supports ownExtensionName
        const componentId = capsule.component.id.toString();
        const execOptions = { cwd: capsule.wrkDir };
        const getExecCall = () => {
          switch (packageManager) {
            case 'npm':
              return execa('npm', ['install', '--no-package-lock'], execOptions);
            case 'yarn':
              return execa('yarn', [], execOptions);
            case 'pnpm':
              return execa('pnpm', ['install'], execOptions);
            default:
              throw new Error(`unsupported package manager ${packageManager}`);
          }
        };
        const installProc = getExecCall();
        logPublisher.info(`${componentId}, ${packageManager === 'npm' ? '$ npm install --no-package-lock' : '$ yarn'}`); // TODO: better
        installProc.stdout!.on('data', (d) => logPublisher.info(`${componentId}, ${d.toString()}`));
        installProc.stderr!.on('data', (d) => logPublisher.warn(`${componentId}, ${d.toString()}`));
        installProc.on('error', (e) => {
          console.error(e); // eslint-disable-line no-console
          logPublisher.error(`${componentId}, ${e}`);
        });
        await installProc;
        linkBitBinInCapsule(capsule);
        longProcessLogger.logProgress(componentId);
      });
    } else {
      throw new Error(`unsupported package manager ${packageManager}`);
    }
    longProcessLogger.end();
    return null;
  }

  async runInstallInFolder(folder: string, opts: installOpts = {}) {
    // TODO: remove this hack once harmony supports ownExtensionName
    const logPublisher: LogPublisher = this.logger.createLogPublisher('packageManager');
    const packageManager = opts.packageManager || this.packageManagerName;
    if (packageManager === 'yarn') {
      const child = execa('yarn', [], { cwd: folder, stdio: 'pipe' });
      pipeOutput(child);
      await child;
      return null;
    }
    if (packageManager === 'npm') {
      const child = execa('npm', ['install'], { cwd: folder, stdio: 'pipe' });
      logPublisher.info(`${folder} $ npm install`);
      await new Promise((resolve, reject) => {
        // @ts-ignore
        child.stdout.on('data', (d) => logPublisher.info(`${folder}, ${d.toString()}`));
        // @ts-ignore
        child.stderr.on('data', (d) => logPublisher.warn(`${folder}, ${d.toString()}`));
        child.on('error', (e) => {
          reject(e);
        });
        child.on('close', (exitStatus) => {
          if (exitStatus) {
            reject(new Error(`${folder}`));
          } else {
            resolve();
          }
        });
      });
      return null;
    }
    throw new Error(`unsupported package manager ${packageManager}`);
  }
}

function linkBitBinInCapsule(capsule) {
  const bitBinPath = path.join(capsule.wrkDir, './node_modules/bit-bin');
  const getLocalBitBinPath = () => {
    const pathOutsideNodeModules = path.join(__dirname, '../..');
    if (pathOutsideNodeModules.endsWith(`${path.sep}dist`)) {
      return pathOutsideNodeModules;
    }
    if (__dirname.includes('build-harmony')) {
      // for bit-bin development, the cli extension is installed as a package in build-harmony directory
      return path.join(__dirname.split('build-harmony')[0], 'dist');
    }
    throw new Error('unable to link bit-bin to the capsule, the location of bit-bin is unknown');
  };
  const localBitBinPath = getLocalBitBinPath();
  // if there are no deps, sometimes the node_modules folder is not created
  // and we need it in order to perform the linking
  try {
    capsule.fs.mkdirSync('node_modules');
  } catch (e) {
    // fail silently - we only need to create it if it doesn't already exist
  }
  // we use fs directly here rather than the capsule.fs because there are some edge cases
  // that the capusle fs does not deal with well (eg. identifying and deleting
  // a symlink rather than the what the symlink links to)
  fs.removeSync(bitBinPath);
  createSymlinkOrCopy(localBitBinPath, bitBinPath);
}
