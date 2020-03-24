/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from 'path';
import execa from 'execa';
import librarian from 'librarian';
import { Reporter } from '../reporter';
import { Capsule } from '../isolator/capsule';
import { pipeOutput } from '../../utils/child_process';

export type installOpts = {
  packageManager?: string;
};

function deleteBitBinFromPkgJson(capsule) {
  // try {
  const packageJsonPath = 'package.json';
  const pjsonString = capsule.fs.readFileSync(packageJsonPath).toString();
  if (pjsonString) {
    const packageJson = JSON.parse(pjsonString);
    delete packageJson.dependencies['bit-bin'];
    capsule.fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }
  // } catch (e) {}
}

function linkBitBinInCapsule(capsule) {
  const bitBinPath = './node_modules/bit-bin';
  const localBitBinPath = path.join(__dirname, '../..');
  // if there are no deps, sometimes the node_modules folder is not created
  // and we need it in order to perform the linking
  try {
    capsule.fs.mkdirSync('node_modules');
  } catch (e) {
    // fail silently - we only need to create it if it doesn't already exist
  }
  // we use execa here rather than the capsule.fs because there are some edge cases
  // that the capusle fs does not deal with well (eg. identifying and deleting
  // a symlink rather than the what the symlink links to)
  execa.sync('rm', ['-rf', bitBinPath], { cwd: capsule.wrkDir });
  execa.sync('ln', ['-s', localBitBinPath, bitBinPath], { cwd: capsule.wrkDir });
}

export default class PackageManager {
  constructor(readonly packageManagerName: string, readonly reporter: Reporter) {}

  get name() {
    return this.packageManagerName;
  }
  async runInstall(capsules: Capsule[], opts: installOpts = {}) {
    const packageManager = opts.packageManager || this.packageManagerName;
    if (packageManager === 'librarian') {
      return librarian.runMultipleInstalls(capsules.map(cap => cap.wrkDir));
    }
    if (packageManager === 'yarn') {
      await Promise.all(
        capsules.map(async capsule => {
          deleteBitBinFromPkgJson(capsule);
          const reporter = this.reporter.createLogger(capsule.component.id.toString());
          const installProc = execa('yarn', [], { cwd: capsule.wrkDir, stdio: 'pipe' });
          reporter.info('$ yarn'); // TODO: better
          reporter.info('');
          installProc.stdout!.on('data', d => reporter.info(d.toString()));
          installProc.stderr!.on('data', d => reporter.warn(d.toString()));
          installProc.on('error', e => {
            console.error('error', e);
          });
          await installProc;
          linkBitBinInCapsule(capsule);
        })
      );
    } else if (packageManager === 'npm') {
      await Promise.all(
        capsules.map(async capsule => {
          deleteBitBinFromPkgJson(capsule);
          const reporter = this.reporter.createLogger(capsule.component.id.toString());
          const installProc = execa('npm', ['install', '--no-package-lock'], { cwd: capsule.wrkDir, stdio: 'pipe' });
          reporter.info('$ npm install --no-package-lock'); // TODO: better
          reporter.info('');
          installProc.stdout!.on('data', d => reporter.info(d.toString()));
          installProc.stderr!.on('data', d => reporter.warn(d.toString()));
          installProc.on('error', e => {
            console.log('error:', e);
          });
          await installProc;
          linkBitBinInCapsule(capsule);
        })
      );
    } else {
      throw new Error(`unsupported package manager ${packageManager}`);
    }
    return null;
  }

  async runInstallInFolder(folder: string, opts: installOpts = {}) {
    const reporter = this.reporter.createLogger(folder);
    const packageManager = opts.packageManager || this.packageManagerName;
    if (packageManager === 'librarian') {
      const child = librarian.runInstall(folder, { stdio: 'pipe' });
      await new Promise((resolve, reject) => {
        child.stdout.on('data', d => reporter.info(d.toString()));
        // @ts-ignore
        child.stderr.on('data', d => reporter.warn(d.toString()));
        child.on('error', e => reject(e));
        child.on('close', () => {
          // TODO: exit status
          resolve();
        });
      });
      return null;
    }
    if (packageManager === 'yarn') {
      const child = execa('yarn', [], { cwd: folder, stdio: 'pipe' });
      pipeOutput(child);
      await child;
      return null;
    }
    if (packageManager === 'npm') {
      const child = execa('npm', ['install'], { cwd: folder, stdio: 'pipe' });
      reporter.info('$ npm install');
      reporter.info('');
      await new Promise((resolve, reject) => {
        // @ts-ignore
        child.stdout.on('data', d => reporter.info(d.toString()));
        // @ts-ignore
        child.stderr.on('data', d => reporter.warn(d.toString()));
        child.on('error', e => {
          reject(e);
        });
        child.on('close', exitStatus => {
          // TODO: exit status
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
