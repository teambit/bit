import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  parsePkgDir,
  resolutionCandidates,
  snapshotLoadedNestedPkgDirs,
  restoreRemovedLoadedNestedPkgDirs,
} from './preserve-loaded-nested-pkg-dirs';

const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');

describe('parsePkgDir()', () => {
  it('should attribute a file to the unscoped package holding it', () => {
    const parsed = parsePkgDir(path.join('/ws', 'node_modules', 'is-odd', 'index.js'));
    expect(parsed?.pkgName).to.equal('is-odd');
    expect(parsed?.dirPath).to.equal(path.join('/ws', 'node_modules', 'is-odd'));
    expect(parsed?.nodeModulesDir).to.equal(path.join('/ws', 'node_modules'));
  });

  it('should take both segments of a scoped package name', () => {
    const parsed = parsePkgDir(path.join('/ws', 'node_modules', '@teambit', 'aspect', 'dist', 'aspect.env.js'));
    expect(parsed?.pkgName).to.equal('@teambit/aspect');
    expect(parsed?.dirPath).to.equal(path.join('/ws', 'node_modules', '@teambit', 'aspect'));
  });

  it('should attribute a file to the nearest node_modules boundary, not the outermost', () => {
    const parsed = parsePkgDir(
      path.join('/ws', 'node_modules', '.bit_roots', 'x', 'node_modules', '@teambit', 'aspect', 'dist', 'a.js')
    );
    expect(parsed?.pkgName).to.equal('@teambit/aspect');
    expect(parsed?.dirPath).to.equal(
      path.join('/ws', 'node_modules', '.bit_roots', 'x', 'node_modules', '@teambit', 'aspect')
    );
  });

  it('should return undefined for a path with no node_modules in it', () => {
    expect(parsePkgDir(path.join('/ws', 'comp1', 'index.js'))).to.equal(undefined);
  });

  it('should return undefined for a scope directory with no package under it', () => {
    expect(parsePkgDir(path.join('/ws', 'node_modules', '@teambit'))).to.equal(undefined);
  });
});

describe('resolutionCandidates()', () => {
  const dirPath = path.join('/ws', 'node_modules', '.bit_roots', 'x', 'node_modules', '@teambit', 'aspect');
  const nodeModulesDir = path.join('/ws', 'node_modules', '.bit_roots', 'x', 'node_modules');

  it('should walk the node_modules chain up to the workspace root', () => {
    const candidates = [...resolutionCandidates('/ws', { dirPath, nodeModulesDir, pkgName: '@teambit/aspect' })];
    expect(candidates).to.include(path.join('/ws', 'node_modules', '@teambit', 'aspect'));
  });

  it('should not offer the removed directory itself as a donor', () => {
    const candidates = [...resolutionCandidates('/ws', { dirPath, nodeModulesDir, pkgName: '@teambit/aspect' })];
    expect(candidates).to.not.include(dirPath);
  });

  it('should not descend past the workspace root into bit own installation', () => {
    const candidates = [...resolutionCandidates('/ws', { dirPath, nodeModulesDir, pkgName: '@teambit/aspect' })];
    expect(candidates.every((c) => c.startsWith(path.resolve('/ws')))).to.equal(true);
  });

  it('should not append node_modules to an ancestor that is itself a node_modules', () => {
    const candidates = [...resolutionCandidates('/ws', { dirPath, nodeModulesDir, pkgName: '@teambit/aspect' })];
    expect(candidates).to.not.include(path.join('/ws', 'node_modules', 'node_modules', '@teambit', 'aspect'));
  });
});

describe('snapshot and restore of a nested package the install removed', () => {
  let workspace: string;
  let nested: string;
  let hoisted: string;

  const writePkg = (dir: string, version: string) => {
    fs.outputJsonSync(path.join(dir, 'package.json'), { name: '@teambit/aspect', version });
    fs.outputFileSync(path.join(dir, 'dist', 'aspect.env.js'), '// entry');
    fs.outputFileSync(path.join(dir, 'dist', 'babel', 'babel-config.js'), '// deferred require target');
  };

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'preserve-nested-'));
    nested = path.join(
      workspace,
      'node_modules',
      '.bit_roots',
      'teambit.harmony_aspect',
      'node_modules',
      '@teambit',
      'aspect'
    );
    hoisted = path.join(workspace, 'node_modules', '@teambit', 'aspect');
    writePkg(nested, '1.0.1042');
    writePkg(hoisted, '1.0.1042');
    (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(nested, 'dist', 'aspect.env.js')]);
  });

  afterEach(() => {
    delete (globalThis as any)[LOADED_ESM_FILES];
    fs.removeSync(workspace);
  });

  it('should snapshot the nested directory the loaded module came from', () => {
    const snapshot = snapshotLoadedNestedPkgDirs(workspace);
    expect(snapshot).to.have.lengthOf(1);
    expect(snapshot[0].dirPath).to.equal(nested);
    expect(snapshot[0].pkgName).to.equal('@teambit/aspect');
    expect(snapshot[0].version).to.equal('1.0.1042');
  });

  it('should restore it from the hoisted copy when the install removes it', async () => {
    const snapshot = snapshotLoadedNestedPkgDirs(workspace);
    fs.removeSync(nested);
    await restoreRemovedLoadedNestedPkgDirs(workspace, snapshot);
    // the file the loaded module defers a require to is what has to come back
    expect(fs.existsSync(path.join(nested, 'dist', 'babel', 'babel-config.js'))).to.equal(true);
  });

  it('should leave a directory the install kept untouched', async () => {
    const snapshot = snapshotLoadedNestedPkgDirs(workspace);
    fs.outputFileSync(path.join(nested, 'marker'), 'kept');
    await restoreRemovedLoadedNestedPkgDirs(workspace, snapshot);
    expect(fs.readFileSync(path.join(nested, 'marker'), 'utf8')).to.equal('kept');
  });

  it('should not restore from a different version', async () => {
    const snapshot = snapshotLoadedNestedPkgDirs(workspace);
    fs.removeSync(nested);
    writePkg(hoisted, '1.0.2000');
    await restoreRemovedLoadedNestedPkgDirs(workspace, snapshot);
    expect(fs.existsSync(nested)).to.equal(false);
  });

  it('should ignore packages loaded from the virtual store, which has its own preservation', () => {
    const slot = path.join(
      workspace,
      'node_modules',
      '.pnpm',
      '@teambit+aspect@1.0.1042',
      'node_modules',
      '@teambit',
      'aspect'
    );
    writePkg(slot, '1.0.1042');
    (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(slot, 'dist', 'aspect.env.js')]);
    expect(snapshotLoadedNestedPkgDirs(workspace)).to.have.lengthOf(0);
  });

  it('should ignore files loaded from outside the workspace', () => {
    (globalThis as any)[LOADED_ESM_FILES] = new Set([
      path.join(fs.realpathSync(os.tmpdir()), 'elsewhere', 'node_modules', '@teambit', 'aspect', 'dist', 'a.js'),
    ]);
    expect(snapshotLoadedNestedPkgDirs(workspace)).to.have.lengthOf(0);
  });

  it('should skip a directory whose version cannot be read, having no way to prove a donor equivalent', () => {
    fs.removeSync(path.join(nested, 'package.json'));
    expect(snapshotLoadedNestedPkgDirs(workspace)).to.have.lengthOf(0);
  });
});

describe('a loaded package directory replaced by a dangling symlink', () => {
  let workspace: string;
  let nested: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'preserve-dangling-'));
    nested = path.join(workspace, 'node_modules', '.bit_roots', 'x', 'node_modules', 'is-odd');
    fs.outputJsonSync(path.join(nested, 'package.json'), { name: 'is-odd', version: '2.0.0' });
    fs.outputJsonSync(path.join(workspace, 'node_modules', 'is-odd', 'package.json'), {
      name: 'is-odd',
      version: '2.0.0',
    });
    (globalThis as any)[LOADED_ESM_FILES] = new Set([path.join(nested, 'package.json')]);
  });

  afterEach(() => {
    delete (globalThis as any)[LOADED_ESM_FILES];
    fs.removeSync(workspace);
  });

  it('should leave the link alone rather than copy through it to its missing target', async () => {
    const snapshot = snapshotLoadedNestedPkgDirs(workspace);
    fs.removeSync(nested);
    fs.symlinkSync(path.join(workspace, 'gone'), nested);
    await restoreRemovedLoadedNestedPkgDirs(workspace, snapshot);
    expect(fs.lstatSync(nested).isSymbolicLink()).to.equal(true);
    expect(fs.existsSync(path.join(workspace, 'gone'))).to.equal(false);
  });
});
