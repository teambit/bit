import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { globalVirtualStoreTypePaths, mergeTypePaths, typesDirToSpecifier } from './global-virtual-store-type-paths';

describe('typesDirToSpecifier()', () => {
  it('should leave an unscoped name alone', () => {
    expect(typesDirToSpecifier('react')).to.eq('react');
  });
  it('should unmangle a scoped name', () => {
    expect(typesDirToSpecifier('babel__core')).to.eq('@babel/core');
  });
  it('should treat only the first separator as the scope separator', () => {
    expect(typesDirToSpecifier('scope__pkg__name')).to.eq('@scope/pkg__name');
  });
});

describe('globalVirtualStoreTypePaths()', () => {
  let root: string;
  const hoisted = () => path.join(root, 'node_modules', '.pnpm', 'node_modules');
  const write = (dir: string, manifest?: Record<string, unknown>, files: string[] = []) => {
    fs.ensureDirSync(dir);
    if (manifest) fs.writeJsonSync(path.join(dir, 'package.json'), manifest);
    files.forEach((file) => fs.outputFileSync(path.join(dir, file), ''));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gvs-type-paths-'));
    fs.ensureDirSync(path.join(root, 'node_modules'));
  });
  afterEach(() => fs.removeSync(root));

  it('should map a @types package whose runtime package ships no typings', () => {
    write(path.join(root, 'node_modules', '@types', 'react'), { name: '@types/react' });
    write(path.join(root, 'node_modules', 'react'), { name: 'react', main: 'index.js' });
    expect(globalVirtualStoreTypePaths(root).react).to.deep.eq([path.join(root, 'node_modules', '@types', 'react')]);
  });

  it('should not map a package that ships typings through the types field', () => {
    write(path.join(root, 'node_modules', '@types', 'glob'), { name: '@types/glob' });
    write(path.join(root, 'node_modules', 'glob'), { name: 'glob', types: './dist/index.d.ts' });
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('glob');
  });

  it('should not map a package that ships an implicit index.d.ts', () => {
    write(path.join(root, 'node_modules', '@types', 'chalk'), { name: '@types/chalk' });
    write(path.join(root, 'node_modules', 'chalk'), { name: 'chalk' }, ['index.d.ts']);
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('chalk');
  });

  it('should map a @types package whose runtime package is not installed at all', () => {
    write(path.join(root, 'node_modules', '@types', 'node'), { name: '@types/node' });
    expect(globalVirtualStoreTypePaths(root)).to.have.property('node');
  });

  it('should unmangle a scoped @types directory into its specifier', () => {
    write(path.join(root, 'node_modules', '@types', 'babel__core'), { name: '@types/babel__core' });
    expect(globalVirtualStoreTypePaths(root)['@babel/core']).to.deep.eq([
      path.join(root, 'node_modules', '@types', 'babel__core'),
    ]);
  });

  it('should let the hoisted directory win a specifier, as the walk out of .pnpm reached it first', () => {
    write(path.join(hoisted(), '@types', 'semver'), { name: '@types/semver' });
    write(path.join(root, 'node_modules', '@types', 'semver'), { name: '@types/semver' });
    expect(globalVirtualStoreTypePaths(root).semver).to.deep.eq([path.join(hoisted(), '@types', 'semver')]);
  });

  it('should map @teambit only to the root, never to the hoisted copies of core aspects', () => {
    write(path.join(hoisted(), '@teambit', 'harmony'), { name: '@teambit/harmony' });
    write(path.join(root, 'node_modules', '@teambit', 'harmony'), { name: '@teambit/harmony' });
    expect(globalVirtualStoreTypePaths(root)['@teambit/*']).to.deep.eq([
      path.join(root, 'node_modules', '@teambit', '*'),
    ]);
  });

  it('should return nothing for a root with no node_modules', () => {
    expect(globalVirtualStoreTypePaths(path.join(root, 'nope'))).to.deep.eq({});
  });
});

describe('mergeTypePaths()', () => {
  it('should keep a configured mapping over the bridged one', () => {
    const merged = mergeTypePaths({ react: ['/configured'] }, { react: ['/bridged'], semver: ['/bridged'] });
    expect(merged).to.deep.eq({ react: ['/configured'], semver: ['/bridged'] });
  });
  it('should work with no configured paths at all', () => {
    expect(mergeTypePaths(undefined, { react: ['/bridged'] })).to.deep.eq({ react: ['/bridged'] });
  });
});
