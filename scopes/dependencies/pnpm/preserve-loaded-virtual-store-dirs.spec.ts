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
  it('should not accept a patched directory as donor for an unpatched one', () => {
    // a patch changes the package's own files, so the donor would not match the modules already
    // loaded from the missing directory - unlike a differing peer set, which changes only the
    // sibling symlinks
    const dirs = ['foo@1.0.0_patch_hash=deadbeef', 'foo@1.0.0_patch_hash=deadbeef_react@18.0.0'];
    expect(findDonorDirName('foo@1.0.0', 'foo', dirs)).to.equal(undefined);
  });
  it('should not accept a differently patched directory as donor', () => {
    const dirs = ['foo@1.0.0_patch_hash=cafe', 'foo@1.0.0'];
    expect(findDonorDirName('foo@1.0.0_patch_hash=deadbeef', 'foo', dirs)).to.equal(undefined);
  });
  it('should accept a same-patch directory under a different peer hash as donor', () => {
    const dirs = ['foo@1.0.0_patch_hash=deadbeef_react@18.0.0', 'foo@1.0.0_patch_hash=cafe'];
    expect(findDonorDirName('foo@1.0.0_patch_hash=deadbeef_react@17.0.0', 'foo', dirs)).to.equal(
      'foo@1.0.0_patch_hash=deadbeef_react@18.0.0'
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

describe('a slot whose dependency was loaded through its symlink spelling', () => {
  // a slot holds its dependencies as symlinks under the same node_modules. a path that kept that
  // spelling instead of being realpathed names the dependency, while the slot is keyed by its owner
  const rootDir = path.join(__dirname, 'fake-ws-for-symlinked-dep-spec');
  const virtualStoreDir = path.join(rootDir, 'node_modules', '.pnpm');
  const dirName = '@teambit+aspect@1.0.1042_somehash';
  const depFile = path.join(virtualStoreDir, dirName, 'node_modules', 'lodash', 'index.js');
  const ownerFile = path.join(virtualStoreDir, dirName, 'node_modules', '@teambit', 'aspect', 'dist', 'env.js');

  afterEach(() => {
    delete require.cache[depFile];
    delete require.cache[ownerFile];
  });

  it('should attribute the slot to its owner even when the dependency was seen first', () => {
    require.cache[depFile] = {} as any;
    require.cache[ownerFile] = {} as any;
    const snapshot = snapshotLoadedVirtualStoreDirs(rootDir);
    expect(snapshot).to.have.lengthOf(1);
    // attributing it to lodash would leave findDonorDirName() unable to match the slot, so the
    // removed directory would never be restored
    expect(snapshot[0].pkgName).to.equal('@teambit/aspect');
    expect(findDonorDirName(dirName, snapshot[0].pkgName, [`@teambit+aspect@1.0.1042_otherhash`])).to.equal(
      '@teambit+aspect@1.0.1042_otherhash'
    );
  });
  it('should fall back to the only package it saw when none names the slot', () => {
    // a slot named after something other than <pkg>@<version> - a tarball or git dependency - which
    // no loaded path can match and which was never restorable anyway
    const tarballDir = 'foo.tgz_hash';
    const tarballFile = path.join(virtualStoreDir, tarballDir, 'node_modules', 'foo', 'index.js');
    require.cache[tarballFile] = {} as any;
    try {
      const entry = snapshotLoadedVirtualStoreDirs(rootDir).find((dir) => dir.dirName === tarballDir);
      expect(entry?.pkgName).to.equal('foo');
    } finally {
      delete require.cache[tarballFile];
    }
  });
});

describe('a global ESM record of the wrong type', () => {
  // the record is a global under a well-known symbol, so nothing stops another party from
  // occupying the key. an install must not die over it
  const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');
  const globalRecord = globalThis as { [LOADED_ESM_FILES]?: unknown };
  const rootDir = path.join(__dirname, 'fake-ws-for-spec');
  let previousEsmSet: unknown;

  before(() => {
    previousEsmSet = globalRecord[LOADED_ESM_FILES];
  });
  afterEach(() => {
    delete globalRecord[LOADED_ESM_FILES];
  });
  after(() => {
    if (previousEsmSet) globalRecord[LOADED_ESM_FILES] = previousEsmSet;
    else delete globalRecord[LOADED_ESM_FILES];
  });

  it('should be ignored rather than thrown over', () => {
    globalRecord[LOADED_ESM_FILES] = { not: 'a set' };
    expect(() => snapshotLoadedVirtualStoreDirs(rootDir)).to.not.throw();
    expect(() => loadedVirtualStoreDirNames(path.join(rootDir, 'node_modules', '.pnpm'))).to.not.throw();
  });
  it('should keep the entries that are paths when the record holds mixed values', () => {
    const dirName = 'lodash@4.17.21';
    const file = path.join(rootDir, 'node_modules', '.pnpm', dirName, 'node_modules', 'lodash', 'index.js');
    globalRecord[LOADED_ESM_FILES] = new Set([42, file]);
    expect([...loadedVirtualStoreDirNames(path.join(rootDir, 'node_modules', '.pnpm'))]).to.deep.equal([dirName]);
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
