import { expect } from 'chai';
import fs from 'fs-extra';
import Module from 'module';
import os from 'os';
import path from 'path';
import {
  ensureHoistedDependencyResolution,
  hoistedResolutionDirs,
  isPathInsideOrEqual,
  isSamePath,
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
  let register: unknown;
  // the two process-global side effects of the function under test, neither of them scoped to a
  // test: `_initPaths()` rederives Module.globalPaths from NODE_PATH, and `module.register()`
  // installs an ESM loader that cannot be removed for the life of the process
  const nodeModule = Module as unknown as { register?: unknown; _initPaths(): void };
  const hoisted = () => path.join(root, 'node_modules', '.pnpm', 'node_modules');
  const rootModules = () => path.join(root, 'node_modules');
  const entries = () => (process.env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-hoisted-resolution-'));
    fs.ensureDirSync(hoisted());
    nodePath = process.env.NODE_PATH;
    nodeOptions = process.env.NODE_OPTIONS;
    // these cases are about NODE_PATH order; taking `register` away keeps the ESM half - the
    // irreversible half - out of the test process, through the same guard that carries older
    // runtimes
    register = nodeModule.register;
    nodeModule.register = undefined;
  });
  afterEach(() => {
    if (nodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = nodePath;
    if (nodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = nodeOptions;
    nodeModule.register = register;
    // restoring the variable is not enough: the resolver reads the paths derived from it, which
    // would otherwise still point into the directory removed on the next line
    nodeModule._initPaths();
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

  it('should replace an entry that names an owned directory in another spelling', () => {
    process.env.NODE_PATH = [`${rootModules()}${path.sep}`, `${hoisted()}${path.sep}.`].join(path.delimiter);
    ensureHoistedDependencyResolution(root);
    expect(entries()).to.deep.eq([hoisted(), rootModules()]);
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

describe('ensureHoistedDependencyResolution() esm registration', () => {
  let first: string;
  let second: string;
  let nodePath: string | undefined;
  let nodeOptions: string | undefined;
  let register: unknown;
  const nodeModule = Module as unknown as { register?: unknown; _initPaths(): void };
  const flag = () => (process.env.NODE_OPTIONS ?? '').match(/--import=\S+/)?.[0];

  beforeEach(() => {
    first = fs.mkdtempSync(path.join(os.tmpdir(), 'esm-registration-first-'));
    second = fs.mkdtempSync(path.join(os.tmpdir(), 'esm-registration-second-'));
    [first, second].forEach((root) => fs.ensureDirSync(path.join(root, 'node_modules', '.pnpm', 'node_modules')));
    nodePath = process.env.NODE_PATH;
    nodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_PATH;
    delete process.env.NODE_OPTIONS;
    register = nodeModule.register;
    // a no-op keeps the body running - the flag is what these cases are about - without leaving a
    // loader registered on the process
    nodeModule.register = () => {};
  });
  afterEach(() => {
    if (nodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = nodePath;
    if (nodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = nodeOptions;
    nodeModule.register = register;
    nodeModule._initPaths();
    [first, second].forEach((root) => fs.removeSync(root));
  });

  it('should hand children a flag carrying the order NODE_PATH now reads', () => {
    ensureHoistedDependencyResolution(first);
    ensureHoistedDependencyResolution(second);
    const beforeReorder = flag();
    // bridging the first root again moves its directories back to the front, so the list the
    // loader was registered with no longer matches the one CommonJS resolves through
    ensureHoistedDependencyResolution(first);
    expect(flag()).to.not.eq(beforeReorder);
  });

  it('should leave the flag alone when nothing about the list changed', () => {
    ensureHoistedDependencyResolution(first);
    const unchanged = flag();
    ensureHoistedDependencyResolution(first);
    expect(flag()).to.eq(unchanged);
  });
});

describe('isSamePath()', () => {
  const dir = path.resolve('/base', 'node_modules');
  it('should ignore a trailing separator', () => {
    expect(isSamePath(`${dir}${path.sep}`, dir)).to.eq(true);
  });
  it('should ignore a redundant current-directory segment', () => {
    expect(isSamePath(path.join(dir, '.'), dir)).to.eq(true);
  });
  it('should separate genuinely different directories', () => {
    expect(isSamePath(path.join(dir, 'nested'), dir)).to.eq(false);
  });
});
