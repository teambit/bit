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

  it('should not map a package whose declarations sit beside a nested entry point', () => {
    write(path.join(root, 'node_modules', '@types', 'nested'), { name: '@types/nested' });
    write(path.join(root, 'node_modules', 'nested'), { name: 'nested', main: 'dist/index.js' }, ['dist/index.d.ts']);
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('nested');
  });

  it('should not map a package whose entry point is a directory with an index.d.ts', () => {
    write(path.join(root, 'node_modules', '@types', 'dir-entry'), { name: '@types/dir-entry' });
    write(path.join(root, 'node_modules', 'dir-entry'), { name: 'dir-entry', main: './lib' }, ['lib/index.d.ts']);
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('dir-entry');
  });

  it('should not map a package whose declarations carry the esm extension', () => {
    write(path.join(root, 'node_modules', '@types', 'esm-typed'), { name: '@types/esm-typed' });
    write(path.join(root, 'node_modules', 'esm-typed'), { name: 'esm-typed', main: 'dist/index.mjs' }, [
      'dist/index.d.mts',
    ]);
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('esm-typed');
  });

  it('should not map a package whose declarations carry the cjs extension', () => {
    write(path.join(root, 'node_modules', '@types', 'cjs-typed'), { name: '@types/cjs-typed' });
    write(path.join(root, 'node_modules', 'cjs-typed'), { name: 'cjs-typed', main: 'dist/index.cjs' }, [
      'dist/index.d.cts',
    ]);
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('cjs-typed');
  });

  it('should not map a package whose declarations sit beside an export target', () => {
    // no `types` condition and no `main`: the modern resolver infers the declarations from the
    // target it picked, and so does this
    write(path.join(root, 'node_modules', '@types', 'export-typed'), { name: '@types/export-typed' });
    write(path.join(root, 'node_modules', 'export-typed'), {
      name: 'export-typed',
      exports: { '.': { import: './dist/index.mjs' } },
    });
    fs.outputFileSync(path.join(root, 'node_modules', 'export-typed', 'dist', 'index.d.mts'), '');
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('export-typed');
  });

  it('should not map a package that declares types through a conditional export', () => {
    write(path.join(root, 'node_modules', '@types', 'exported'), { name: '@types/exported' });
    write(path.join(root, 'node_modules', 'exported'), {
      name: 'exported',
      exports: { '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } } },
    });
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('exported');
  });

  it('should not map a package that ships types through typesVersions', () => {
    write(path.join(root, 'node_modules', '@types', 'versioned'), { name: '@types/versioned' });
    write(path.join(root, 'node_modules', 'versioned'), {
      name: 'versioned',
      typesVersions: { '>=4.0': { '*': ['types/*'] } },
    });
    expect(globalVirtualStoreTypePaths(root)).to.not.have.property('versioned');
  });

  it('should still map a package that only ships javascript beside its entry point', () => {
    write(path.join(root, 'node_modules', '@types', 'plain'), { name: '@types/plain' });
    write(path.join(root, 'node_modules', 'plain'), { name: 'plain', main: 'dist/index.js' }, ['dist/index.js']);
    expect(globalVirtualStoreTypePaths(root)).to.have.property('plain');
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
