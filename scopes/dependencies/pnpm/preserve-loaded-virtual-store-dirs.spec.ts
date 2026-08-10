import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  findDonorDirName,
  loadedVirtualStoreDirNames,
  snapshotLoadedVirtualStoreDirs,
} from './preserve-loaded-virtual-store-dirs';

describe('findDonorDirName()', () => {
  it('should find a directory holding the same name@version under a different peer hash', () => {
    const dirs = [
      '@teambit+aspect@1.0.1042_@apollo+client@3.14.1_452750bf6cbf39e91ae03fa2952ea516',
      '@teambit+aspect@1.0.1043_452750bf6cbf39e91ae03fa2952ea516',
      'lodash@4.17.21',
    ];
    expect(
      findDonorDirName('@teambit+aspect@1.0.1042_fad919769e36a84e6cf4fd53cf9f0ee0', '@teambit/aspect', dirs)
    ).to.equal('@teambit+aspect@1.0.1042_@apollo+client@3.14.1_452750bf6cbf39e91ae03fa2952ea516');
  });
  it('should accept a peerless directory as donor for a peer-hashed one', () => {
    expect(findDonorDirName('@teambit+aspect@1.0.1042_fad9', '@teambit/aspect', ['@teambit+aspect@1.0.1042'])).to.equal(
      '@teambit+aspect@1.0.1042'
    );
  });
  it('should not match a different version', () => {
    expect(
      findDonorDirName('@teambit+aspect@1.0.1042_fad9', '@teambit/aspect', ['@teambit+aspect@1.0.1043_fad9'])
    ).to.equal(undefined);
  });
  it('should not match a version that merely starts with the wanted one', () => {
    expect(findDonorDirName('lodash@4.17.2', 'lodash', ['lodash@4.17.21'])).to.equal(undefined);
  });
  it('should not return the missing directory itself', () => {
    expect(findDonorDirName('lodash@4.17.21', 'lodash', ['lodash@4.17.21'])).to.equal(undefined);
  });
  it('should handle package names containing underscores', () => {
    expect(findDonorDirName('weird_name@1.0.0_abc', 'weird_name', ['weird_name@1.0.0_def'])).to.equal(
      'weird_name@1.0.0_def'
    );
  });
  it('should handle prerelease versions', () => {
    expect(findDonorDirName('typescript@5.0.0-beta_abc', 'typescript', ['typescript@5.0.0-beta_def'])).to.equal(
      'typescript@5.0.0-beta_def'
    );
  });
});

describe('loaded-module scanning', () => {
  const rootDir = path.join(__dirname, 'fake-ws-for-spec');
  const virtualStoreDir = path.join(rootDir, 'node_modules', '.pnpm');
  const dirName = '@teambit+aspect@1.0.1042_somehash';
  const cachedFile = path.join(virtualStoreDir, dirName, 'node_modules', '@teambit', 'aspect', 'dist', 'env.js');
  const outsideFile = path.join(rootDir, 'node_modules', '@teambit', 'other', 'index.js');
  // the same global-set contract aspect-loader's record-loaded-esm-file.ts writes to
  const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');
  const esmDirName = '@my+esm-env@2.0.0_peerhash';
  const esmFile = path.join(virtualStoreDir, esmDirName, 'node_modules', '@my', 'esm-env', 'dist', 'index.mjs');
  const globalRecord = globalThis as { [LOADED_ESM_FILES]?: Set<string> };
  let previousEsmSet: Set<string> | undefined;

  before(() => {
    // require.cache keys just need to exist; the files behind them do not
    require.cache[cachedFile] = {} as any;
    require.cache[outsideFile] = {} as any;
    previousEsmSet = globalRecord[LOADED_ESM_FILES];
    globalRecord[LOADED_ESM_FILES] = new Set([esmFile]);
  });
  after(() => {
    delete require.cache[cachedFile];
    delete require.cache[outsideFile];
    if (previousEsmSet) globalRecord[LOADED_ESM_FILES] = previousEsmSet;
    else delete globalRecord[LOADED_ESM_FILES];
  });

  it('snapshotLoadedVirtualStoreDirs() should attribute a cached file to its slot dir and package', () => {
    const snapshot = snapshotLoadedVirtualStoreDirs(rootDir);
    const entry = snapshot.find((dir) => dir.dirName === dirName);
    expect(entry).to.not.equal(undefined);
    expect(entry!.pkgName).to.equal('@teambit/aspect');
    expect(entry!.dirPath).to.equal(path.join(virtualStoreDir, dirName));
  });
  it('snapshotLoadedVirtualStoreDirs() should include recorded ESM loads', () => {
    const snapshot = snapshotLoadedVirtualStoreDirs(rootDir);
    const entry = snapshot.find((dir) => dir.dirName === esmDirName);
    expect(entry).to.not.equal(undefined);
    expect(entry!.pkgName).to.equal('@my/esm-env');
  });
  it('snapshotLoadedVirtualStoreDirs() should ignore cached files outside the virtual store', () => {
    const snapshot = snapshotLoadedVirtualStoreDirs(rootDir);
    expect(snapshot).to.have.lengthOf(2);
  });
  it('loadedVirtualStoreDirNames() should return CJS and ESM slot dir names', () => {
    expect([...loadedVirtualStoreDirNames(virtualStoreDir)].sort()).to.deep.equal([dirName, esmDirName].sort());
  });
});

describe('loaded-module scanning in a workspace reached through a symlink', () => {
  // node resolves a module's filename through its realpath, so require.cache is keyed by the real
  // spelling even when the install was handed the symlinked one. this is the everyday case on
  // macOS, where a temp dir under /var is really under /private/var.
  const tmpDir = fs.realpathSync(os.tmpdir());
  const realRoot = path.join(tmpDir, 'preserve-loaded-vsd-spec-real');
  const linkedRoot = path.join(tmpDir, 'preserve-loaded-vsd-spec-link');
  const dirName = '@teambit+aspect@1.0.1042_somehash';
  const realSlotDir = path.join(realRoot, 'node_modules', '.pnpm', dirName);
  const realCachedFile = path.join(realSlotDir, 'node_modules', '@teambit', 'aspect', 'dist', 'env.js');
  let symlinksSupported = true;

  before(() => {
    fs.removeSync(linkedRoot);
    fs.removeSync(realRoot);
    fs.mkdirpSync(path.dirname(realCachedFile));
    try {
      fs.symlinkSync(realRoot, linkedRoot, 'dir');
    } catch {
      symlinksSupported = false; // unprivileged Windows
    }
    require.cache[realCachedFile] = {} as any;
  });
  after(() => {
    delete require.cache[realCachedFile];
    fs.removeSync(linkedRoot);
    fs.removeSync(realRoot);
  });

  it('snapshotLoadedVirtualStoreDirs() should find a slot loaded by its realpath', function () {
    if (!symlinksSupported) this.skip();
    const snapshot = snapshotLoadedVirtualStoreDirs(linkedRoot);
    expect(snapshot.map((dir) => dir.dirName)).to.deep.equal([dirName]);
    expect(snapshot[0].pkgName).to.equal('@teambit/aspect');
    // the recorded path addresses the same directory the module was loaded from, so the existence
    // check and the restore that follow act on it rather than on a path that never matched
    expect(fs.realpathSync(snapshot[0].dirPath)).to.equal(realSlotDir);
  });
  it('loadedVirtualStoreDirNames() should find it through the symlinked spelling', function () {
    if (!symlinksSupported) this.skip();
    const dirNames = loadedVirtualStoreDirNames(path.join(linkedRoot, 'node_modules', '.pnpm'));
    expect([...dirNames]).to.deep.equal([dirName]);
  });
});
