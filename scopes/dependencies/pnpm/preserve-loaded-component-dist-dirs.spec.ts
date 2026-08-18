import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  snapshotLoadedComponentDistDirs,
  restoreWipedLoadedComponentDistDirs,
} from './preserve-loaded-component-dist-dirs';

const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');

describe('snapshot and restore of a component dist the install wiped in place', () => {
  let workspace: string;
  let pkgDir: string;
  let distDir: string;

  const writeLocalPkg = (dir: string, opts: { bitLocal?: boolean } = {}) => {
    fs.outputJsonSync(path.join(dir, 'package.json'), {
      name: '@teambit/legacy.constants',
      version: '0.0.41',
      main: 'dist/constants.js',
      ...(opts.bitLocal === false ? {} : { _bit_local: true }),
    });
    fs.outputFileSync(path.join(dir, 'dist', 'constants.js'), '// entry');
    fs.outputFileSync(path.join(dir, 'dist', 'exceptions', 'main-file-removed.js'), '// deferred require target');
  };

  /** what the engine's re-import does: the package dir survives, its dist does not */
  const wipeDist = () => {
    fs.removeSync(distDir);
  };

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'preserve-dists-'));
    pkgDir = path.join(workspace, 'node_modules', '@teambit', 'legacy.constants');
    distDir = path.join(pkgDir, 'dist');
    writeLocalPkg(pkgDir);
    (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(distDir, 'constants.js')]);
  });

  afterEach(() => {
    delete (globalThis as any)[LOADED_ESM_FILES];
    fs.removeSync(workspace);
  });

  it('should snapshot the dist of a loaded _bit_local package', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    expect(snapshot?.dirs).to.have.lengthOf(1);
    expect(snapshot?.dirs[0].distPath).to.equal(distDir);
    expect(fs.existsSync(snapshot!.dirs[0].clonePath)).to.equal(true);
  });

  it('should restore a wiped dist from the clone, including files never loaded', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    wipeDist();
    await restoreWipedLoadedComponentDistDirs(snapshot);
    // the file the loaded module defers a require to is what has to come back
    expect(fs.existsSync(path.join(distDir, 'exceptions', 'main-file-removed.js'))).to.equal(true);
  });

  it('should leave a dist the install kept untouched and still drop the clone root', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    fs.outputFileSync(path.join(distDir, 'marker.js'), '// written after the snapshot');
    await restoreWipedLoadedComponentDistDirs(snapshot);
    expect(fs.readFileSync(path.join(distDir, 'marker.js'), 'utf8')).to.equal('// written after the snapshot');
    expect(fs.existsSync(snapshot!.cloneRootDir)).to.equal(false);
  });

  it('should remove the clone root after restoring', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    wipeDist();
    await restoreWipedLoadedComponentDistDirs(snapshot);
    expect(fs.existsSync(snapshot!.cloneRootDir)).to.equal(false);
  });

  it('should ignore a loaded package that is not a workspace component copy', async () => {
    writeLocalPkg(pkgDir, { bitLocal: false });
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    expect(snapshot).to.equal(undefined);
  });

  it('should ignore files loaded from the virtual store, which is never rewritten in place', async () => {
    const storePkgDir = path.join(
      workspace,
      'node_modules',
      '.pnpm',
      '@teambit+legacy.constants@0.0.41',
      'node_modules',
      '@teambit',
      'legacy.constants'
    );
    writeLocalPkg(storePkgDir);
    (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(storePkgDir, 'dist', 'constants.js')]);
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    expect(snapshot).to.equal(undefined);
  });

  it('should ignore files loaded from outside the workspace', async () => {
    const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'preserve-dists-outside-'));
    try {
      const outsidePkg = path.join(outside, 'node_modules', '@teambit', 'legacy.constants');
      writeLocalPkg(outsidePkg);
      (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(outsidePkg, 'dist', 'constants.js')]);
      const snapshot = await snapshotLoadedComponentDistDirs(workspace);
      expect(snapshot).to.equal(undefined);
    } finally {
      fs.removeSync(outside);
    }
  });

  it('should not write through a symlink occupying the package path', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    const target = path.join(workspace, 'elsewhere');
    fs.mkdirpSync(target);
    fs.removeSync(pkgDir);
    fs.ensureSymlinkSync(target, pkgDir);
    await restoreWipedLoadedComponentDistDirs(snapshot);
    expect(fs.readdirSync(target)).to.have.lengthOf(0);
  });

  it('should restore with hard links, not data copies, when the filesystem allows it', async () => {
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    const cloneEntry = path.join(snapshot!.dirs[0].clonePath, 'constants.js');
    const original = path.join(distDir, 'constants.js');
    expect(fs.statSync(cloneEntry).ino).to.equal(fs.statSync(original).ino);
    await restoreWipedLoadedComponentDistDirs(snapshot);
  });

  it('should reclaim an abandoned clone root from a previous run of the same pid', async () => {
    const leftover = path.join(workspace, 'node_modules', `.bit-preserved-dists-${process.pid}`);
    fs.outputFileSync(path.join(leftover, 'stale'), '');
    const snapshot = await snapshotLoadedComponentDistDirs(workspace);
    expect(fs.existsSync(path.join(leftover, 'stale'))).to.equal(false);
    await restoreWipedLoadedComponentDistDirs(snapshot);
  });
});
