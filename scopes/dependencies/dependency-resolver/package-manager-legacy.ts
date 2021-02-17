/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { pipeOutput } from '@teambit/legacy/dist/utils/child_process';
import createSymlinkOrCopy from '@teambit/legacy/dist/utils/fs/create-symlink-or-copy';
import { EventEmitter } from 'events';
import execa from 'execa';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import path, { join } from 'path';

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
  async capsulesInstall(capsules: Capsule[], opts: {} = {}) {
    const packageManager = this.packageManagerName;
    const longProcessLogger = this.logger.createLongProcessLogger('installing capsules', capsules.length);
    if (packageManager === 'npm' || packageManager === 'yarn' || packageManager === 'pnpm') {
      // Don't run them in parallel (Promise.all), the package-manager doesn't handle it well.
      await mapSeries(capsules, async (capsule) => {
        const componentId = capsule.component.id.toString();
        longProcessLogger.logProgress(componentId);
        // TODO: remove this hack once harmony supports ownExtensionName
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
        this.logger.info(`${componentId}, ${packageManager === 'npm' ? '$ npm install --no-package-lock' : '$ yarn'}`); // TODO: better
        installProc.stdout!.on('data', (d) => this.logger.info(`${componentId}, ${d.toString()}`));
        installProc.stderr!.on('data', (d) => this.logger.warn(`${componentId}, ${d.toString()}`));
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        installProc.on('error', (e) => {
          console.log('error:', e); // eslint-disable-line no-console
          this.logger.error(`${componentId}, ${e}`);
        });
        await installProc;
        linkBitLegacyInCapsule(capsule);
      });
    } else {
      throw new Error(`unsupported package manager ${packageManager}`);
    }
    longProcessLogger.end();
    return null;
  }

  async runInstallInFolder(folder: string, opts: {} = {}): Promise<void> {
    const packageManager = this.packageManagerName;
    if (packageManager === 'yarn') {
      const child = execa('yarn', [], { cwd: folder, stdio: 'pipe' });
      pipeOutput(child);
      await child;
      return;
    }
    if (packageManager === 'npm') {
      const child = execa('npm', ['install'], { cwd: folder, stdio: 'pipe' });
      this.logger.info(`${folder} $ npm install`);
      await new Promise((resolve, reject) => {
        // @ts-ignore
        child.stdout.on('data', (d) => this.logger.info(`${folder} ${d.toString()}`));
        // @ts-ignore
        child.stderr.on('data', (d) => this.logger.warn(`${folder} ${d.toString()}`));
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        child.on('error', (e) => {
          reject(e);
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        child.on('close', (exitStatus) => {
          if (exitStatus) {
            reject(new Error(`${folder}`));
          } else {
            resolve(null);
          }
        });
      });
      return;
    }
    throw new Error(`unsupported package manager ${packageManager}`);
  }
}

function linkBitLegacyInCapsule(capsule) {
  const bitLegacyPath = path.join(capsule.wrkDir, './node_modules/@teambit/legacy');
  const getLocalBitLegacyPath = () => {
    const pathOutsideNodeModules = path.join(__dirname, '../..');
    if (pathOutsideNodeModules.endsWith(`${path.sep}dist`)) {
      return pathOutsideNodeModules;
    }
    if (__dirname.includes('build-harmony')) {
      // for @teambit/legacy development, the cli extension is installed as a package in build-harmony directory
      return path.join(__dirname.split('build-harmony')[0], 'dist');
    }
    throw new Error('unable to link @teambit/legacy to the capsule, the location of @teambit/legacy is unknown');
  };
  const localBitLegacyPath = getLocalBitLegacyPath();
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
  fs.removeSync(bitLegacyPath);
  createSymlinkOrCopy(localBitLegacyPath, bitLegacyPath);
}
