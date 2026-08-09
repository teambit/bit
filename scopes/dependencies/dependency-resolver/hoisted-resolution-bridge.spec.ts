import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  ensureHoistedDependencyResolution,
  hoistedResolutionDirs,
  isPathInsideOrEqual,
  parseRecordedVirtualStoreDir,
} from './hoisted-resolution-bridge';

describe('isPathInsideOrEqual()', () => {
  const base = path.resolve('/base');
  it('should count a descendant as inside', () => {
    expect(isPathInsideOrEqual(path.join(base, 'child'), base)).to.eq(true);
  });
  it('should count a descendant whose name starts with dots as inside', () => {
    expect(isPathInsideOrEqual(path.join(base, '..foo', 'child'), base)).to.eq(true);
  });
  it('should count the parent itself as inside', () => {
    expect(isPathInsideOrEqual(base, base)).to.eq(true);
  });
  it('should count an ancestor as outside', () => {
    expect(isPathInsideOrEqual(path.dirname(base), base)).to.eq(false);
  });
  it('should count a sibling as outside', () => {
    expect(isPathInsideOrEqual(path.join(path.dirname(base), 'sibling'), base)).to.eq(false);
  });
});

describe('parseRecordedVirtualStoreDir()', () => {
  it('should read the JSON manifest current pnpm writes', () => {
    const manifest = JSON.stringify({ hoistedDependencies: {}, virtualStoreDir: '../../store/v11/links' }, null, 2);
    expect(parseRecordedVirtualStoreDir(manifest)).to.eq('../../store/v11/links');
  });
  it('should read a block-YAML manifest from an older pnpm', () => {
    expect(parseRecordedVirtualStoreDir('layoutVersion: 5\nvirtualStoreDir: .pnpm\n')).to.eq('.pnpm');
  });
  it('should not confuse virtualStoreDirMaxLength for the store dir', () => {
    expect(parseRecordedVirtualStoreDir('virtualStoreDirMaxLength: 120\n')).to.eq(undefined);
  });
  it('should return undefined when the manifest records no store dir', () => {
    expect(parseRecordedVirtualStoreDir(JSON.stringify({ layoutVersion: 5 }))).to.eq(undefined);
  });
});

describe('hoistedResolutionDirs()', () => {
  let root: string;
  const hoisted = () => path.join(root, 'node_modules', '.pnpm', 'node_modules');
  const rootModules = () => path.join(root, 'node_modules');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hoisted-resolution-dirs-'));
  });
  afterEach(() => fs.removeSync(root));

  it('should return both directories in the order the walk reached them', () => {
    fs.ensureDirSync(hoisted());
    expect(hoistedResolutionDirs(root)).to.deep.eq([hoisted(), rootModules()]);
  });
  it('should keep the root node_modules when nothing was hoisted', () => {
    fs.ensureDirSync(rootModules());
    expect(hoistedResolutionDirs(root)).to.deep.eq([rootModules()]);
  });
  it('should return nothing for a root that was never installed', () => {
    expect(hoistedResolutionDirs(root)).to.deep.eq([]);
  });
});

describe('ensureHoistedDependencyResolution()', () => {
  let root: string;
  let nodePath: string | undefined;
  let nodeOptions: string | undefined;
  const hoisted = () => path.join(root, 'node_modules', '.pnpm', 'node_modules');
  const rootModules = () => path.join(root, 'node_modules');
  const entries = () => (process.env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-hoisted-resolution-'));
    fs.ensureDirSync(hoisted());
    nodePath = process.env.NODE_PATH;
    nodeOptions = process.env.NODE_OPTIONS;
  });
  afterEach(() => {
    if (nodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = nodePath;
    if (nodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = nodeOptions;
    fs.removeSync(root);
  });

  it('should put both directories in walk order', () => {
    delete process.env.NODE_PATH;
    ensureHoistedDependencyResolution(root);
    expect(entries()).to.deep.eq([hoisted(), rootModules()]);
  });

  it('should reorder entries a previous bridge left in the wrong order', () => {
    // a bit that bridged the hoisted directory alone leaves it in NODE_PATH for its children;
    // adding the root's node_modules in front of it there would invert the walk
    process.env.NODE_PATH = hoisted();
    ensureHoistedDependencyResolution(root);
    expect(entries()).to.deep.eq([hoisted(), rootModules()]);
  });

  it('should keep entries it does not own, behind its own', () => {
    const foreign = path.join(root, 'somewhere-else');
    process.env.NODE_PATH = [rootModules(), foreign].join(path.delimiter);
    ensureHoistedDependencyResolution(root);
    expect(entries()).to.deep.eq([hoisted(), rootModules(), foreign]);
  });

  it('should leave NODE_PATH untouched when it already reads correctly', () => {
    process.env.NODE_PATH = [hoisted(), rootModules()].join(path.delimiter);
    const before = process.env.NODE_PATH;
    ensureHoistedDependencyResolution(root);
    expect(process.env.NODE_PATH).to.eq(before);
  });

  it('should do nothing for a root that was never installed', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-hoisted-resolution-bare-'));
    delete process.env.NODE_PATH;
    try {
      ensureHoistedDependencyResolution(bare);
      expect(process.env.NODE_PATH).to.eq(undefined);
    } finally {
      fs.removeSync(bare);
    }
  });
});
