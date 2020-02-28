import path from 'path';
import execa from 'execa';
import librarian from 'librarian';
import { ComponentCapsule } from '../capsule/component-capsule';
import { pipeOutput } from '../../utils/child_process';

export type installOpts = {
  packageManager?: string;
};

function deleteBitBinFromPkgJson(capsule) {
  const packageJsonPath = 'package.json';
  const pjsonString = capsule.fs.readFileSync(packageJsonPath).toString();
  const packageJson = JSON.parse(pjsonString);
  delete packageJson.dependencies['bit-bin'];
  capsule.fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
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
  constructor(readonly packageManagerName: string) {}

  async runInstall(capsules: ComponentCapsule[], opts: installOpts = {}) {
    const packageManager = opts.packageManager || this.packageManagerName;
    if (packageManager === 'librarian') {
      return librarian.runMultipleInstalls(capsules.map(cap => cap.wrkDir));
    }
    if (packageManager === 'yarn') {
      capsules.forEach(capsule => {
        deleteBitBinFromPkgJson(capsule);
        execa.sync('yarn', [], { cwd: capsule.wrkDir });
        linkBitBinInCapsule(capsule);
      });
    } else if (packageManager === 'npm') {
      capsules.forEach(capsule => {
        deleteBitBinFromPkgJson(capsule);
        execa.sync('npm', ['install', '--no-package-lock'], { cwd: capsule.wrkDir });
        linkBitBinInCapsule(capsule);
      });
    } else {
      throw new Error(`unsupported package manager ${packageManager}`);
    }
    return null;
  }

  async runInstallInFolder(folder: string, opts: installOpts = {}) {
    const packageManager = opts.packageManager || this.packageManagerName;
    if (packageManager === 'librarian') {
      const child = librarian.runInstall(folder, { stdio: 'pipe' });
      pipeOutput(child);
      await child;
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
      pipeOutput(child);
      await child;
      return null;
    }
    throw new Error(`unsupported package manager ${packageManager}`);
  }
}
