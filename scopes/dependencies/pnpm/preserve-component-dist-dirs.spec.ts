import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { snapshotComponentDistDirs, restoreWipedComponentDistDirs } from './preserve-component-dist-dirs';

describe('snapshot and restore of component dists the install wiped in place', () => {
  let workspace: string;
  let pkgDir: string;
  let distDir: string;
  const pkgName = '@teambit/legacy.constants';
  const slotName = '@teambit+legacy.constants@file+components+legacy+constants_react@18.3.1';

  const writeDist = (dir: string) => {
    fs.outputFileSync(path.join(dir, 'dist', 'constants.js'), '// entry');
    fs.outputFileSync(path.join(dir, 'dist', 'exceptions', 'main-file-removed.js'), '// deferred require target');
  };

  const slotPkgDir = () => path.join(workspace, 'node_modules', '.pnpm', slotName, 'node_modules', pkgName);

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'preserve-dists-'));
    pkgDir = path.join(workspace, 'node_modules', pkgName);
    distDir = path.join(pkgDir, 'dist');
    fs.outputJsonSync(path.join(pkgDir, 'package.json'), { name: pkgName, main: 'dist/constants.js' });
    writeDist(pkgDir);
  });

  afterEach(() => {
    fs.removeSync(workspace);
  });

  it('should snapshot the dist of a component package present at the root', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    expect(snapshot?.packages).to.have.lengthOf(1);
    expect(fs.existsSync(snapshot!.packages[0].clonePath)).to.equal(true);
  });

  it('should restore a wiped root dist from the clone, including files never loaded', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.removeSync(distDir);
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(distDir, 'exceptions', 'main-file-removed.js'))).to.equal(true);
  });

  it('should restore into an injected virtual-store slot copy that lost its dist', async () => {
    writeDist(slotPkgDir());
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.removeSync(path.join(slotPkgDir(), 'dist'));
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(slotPkgDir(), 'dist', 'exceptions', 'main-file-removed.js'))).to.equal(true);
  });

  it('should serve a slot the install re-keyed after the snapshot was taken', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    // the re-keyed slot did not exist at snapshot time and holds no dist
    fs.mkdirpSync(slotPkgDir());
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(slotPkgDir(), 'dist', 'constants.js'))).to.equal(true);
  });

  it('should restore into a .bit_roots copy that lost its dist', async () => {
    const bitRootsCopy = path.join(workspace, 'node_modules', '.bit_roots', 'some.env', 'node_modules', pkgName);
    writeDist(bitRootsCopy);
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.removeSync(path.join(bitRootsCopy, 'dist'));
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(bitRootsCopy, 'dist', 'constants.js'))).to.equal(true);
  });

  it('should fall back to a slot copy as the clone source when the root copy has no dist', async () => {
    writeDist(slotPkgDir());
    fs.removeSync(distDir);
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    expect(snapshot?.packages).to.have.lengthOf(1);
    fs.removeSync(path.join(slotPkgDir(), 'dist'));
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(slotPkgDir(), 'dist', 'constants.js'))).to.equal(true);
  });

  it('should leave a dist the install kept untouched and still drop the clone root', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.outputFileSync(path.join(distDir, 'marker.js'), '// written after the snapshot');
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.readFileSync(path.join(distDir, 'marker.js'), 'utf8')).to.equal('// written after the snapshot');
    expect(fs.existsSync(snapshot!.cloneRootDir)).to.equal(false);
  });

  it('should return undefined when no named package has a dist anywhere', async () => {
    fs.removeSync(distDir);
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName, '@teambit/absent']);
    expect(snapshot).to.equal(undefined);
  });

  it('should not write through a symlink occupying the package path', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    const target = path.join(workspace, 'elsewhere');
    fs.mkdirpSync(target);
    fs.removeSync(pkgDir);
    fs.ensureSymlinkSync(target, pkgDir);
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.readdirSync(target)).to.have.lengthOf(0);
  });

  it('should pre-create the root dist when the install removed the whole package dir, for the linker to fill around', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.removeSync(pkgDir);
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(path.join(distDir, 'constants.js'))).to.equal(true);
  });

  it('should not recreate a slot directory the install removed altogether', async () => {
    writeDist(slotPkgDir());
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    fs.removeSync(path.dirname(path.dirname(slotPkgDir()))); // the whole .pnpm slot
    await restoreWipedComponentDistDirs(snapshot);
    expect(fs.existsSync(slotPkgDir())).to.equal(false);
  });

  it('should clone with hard links, not data copies, when the filesystem allows it', async () => {
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    const cloneEntry = path.join(snapshot!.packages[0].clonePath, 'constants.js');
    expect(fs.statSync(cloneEntry).ino).to.equal(fs.statSync(path.join(distDir, 'constants.js')).ino);
    await restoreWipedComponentDistDirs(snapshot);
  });

  it('should reclaim an abandoned clone root from a previous run of the same pid', async () => {
    const leftover = path.join(workspace, 'node_modules', `.bit-preserved-dists-${process.pid}`);
    fs.outputFileSync(path.join(leftover, 'stale'), '');
    const snapshot = await snapshotComponentDistDirs(workspace, [pkgName]);
    expect(fs.existsSync(path.join(leftover, 'stale'))).to.equal(false);
    await restoreWipedComponentDistDirs(snapshot);
  });
});
