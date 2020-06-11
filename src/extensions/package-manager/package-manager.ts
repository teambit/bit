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

export type installOpts = {
  packageManager?: string;
};

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

// TODO:
// this is a hack in order to pass events from here to flows (and later install)
// we need to solve this hack by changing the dependency chain of the relevant extensions
// essentially flattening the structure so that we have less extensions to pass this event through
//
// at the time of writing, it's Flows => Workspace => Isolator => PackageManager
let emitter = null;
export function onCapsuleInstalled(cb) {
  // @ts-ignore - this is a hack
  emitter.on('capsuleInstalled', componentName => cb(componentName));
}
export function beforeInstallingCapsules(cb) {
  // @ts-ignore - this is a hack
  emitter.on('beforeInstallingCapsules', numCapsules => cb(numCapsules));
}

export default class PackageManager {
  private emitter = new EventEmitter();
  constructor(readonly packageManagerName: string, readonly logger: Logger) {
    // @ts-ignore - this is a hack
    emitter = this.emitter;
  }

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
  async runInstall(capsules: Capsule[], opts: installOpts = {}) {
    const packageManager = opts.packageManager || this.packageManagerName;
    const logPublisher = this.logger.createLogPublisher('packageManager');
    this.emitter.emit('beforeInstallingCapsules', capsules.length);
    if (packageManager === 'npm' || packageManager === 'yarn') {
      // Don't run them in parallel (Promise.all), the package-manager doesn't handle it well.
      await pMapSeries(capsules, async capsule => {
        // TODO: remove this hack once harmony supports ownExtensionName
        const componentId = capsule.component.id.toString();
        const installProc =
          packageManager === 'npm'
            ? execa('npm', ['install', '--no-package-lock'], { cwd: capsule.wrkDir, stdio: 'pipe' })
            : execa('yarn', [], { cwd: capsule.wrkDir, stdio: 'pipe' });
        logPublisher.info(componentId, packageManager === 'npm' ? '$ npm install --no-package-lock' : '$ yarn'); // TODO: better
        logPublisher.info(componentId, '');
        installProc.stdout!.on('data', d => logPublisher.info(componentId, d.toString()));
        installProc.stderr!.on('data', d => logPublisher.warn(componentId, d.toString()));
        installProc.on('error', e => {
          console.log('error:', e); // eslint-disable-line no-console
          logPublisher.error(componentId, e);
        });
        await installProc;
        linkBitBinInCapsule(capsule);
        this.emitter.emit('capsuleInstalled', componentId);
      });
    } else {
      throw new Error(`unsupported package manager ${packageManager}`);
    }
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
      logPublisher.info(folder, '$ npm install');
      logPublisher.info(folder, '');
      await new Promise((resolve, reject) => {
        // @ts-ignore
        child.stdout.on('data', d => logPublisher.info(folder, d.toString()));
        // @ts-ignore
        child.stderr.on('data', d => logPublisher.warn(folder, d.toString()));
        child.on('error', e => {
          reject(e);
        });
        child.on('close', exitStatus => {
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
