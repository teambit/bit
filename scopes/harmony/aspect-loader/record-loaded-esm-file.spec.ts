import { expect } from 'chai';
import { recordLoadedEsmFile } from './record-loaded-esm-file';

// the same global-set contract preserve-loaded-virtual-store-dirs.ts (pnpm) reads from
const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');
const globalRecord = globalThis as { [LOADED_ESM_FILES]?: Set<string> };

describe('recordLoadedEsmFile()', () => {
  let previousSet: Set<string> | undefined;
  before(() => {
    previousSet = globalRecord[LOADED_ESM_FILES];
    delete globalRecord[LOADED_ESM_FILES];
  });
  after(() => {
    if (previousSet) globalRecord[LOADED_ESM_FILES] = previousSet;
    else delete globalRecord[LOADED_ESM_FILES];
  });

  it('should replace a record of the wrong type instead of losing every later recording', () => {
    (globalRecord as { [LOADED_ESM_FILES]?: unknown })[LOADED_ESM_FILES] = { not: 'a set' };
    recordLoadedEsmFile('/some/store/dir/node_modules/pkg/index.mjs');
    expect(globalRecord[LOADED_ESM_FILES]).to.be.instanceOf(Set);
    expect([...globalRecord[LOADED_ESM_FILES]!]).to.include('/some/store/dir/node_modules/pkg/index.mjs');
    delete globalRecord[LOADED_ESM_FILES];
  });

  it('should create the global set on first use and record the file', () => {
    recordLoadedEsmFile('/some/store/dir/node_modules/pkg/index.mjs');
    expect([...(globalRecord[LOADED_ESM_FILES] ?? [])]).to.include('/some/store/dir/node_modules/pkg/index.mjs');
  });
  it('should record the realpath of an existing file alongside the given spelling', () => {
    recordLoadedEsmFile(__filename);
    // __filename is already a realpath here, so at minimum the given spelling must be present
    expect([...(globalRecord[LOADED_ESM_FILES] ?? [])]).to.include(__filename);
  });
  it('should not throw for a path that does not exist', () => {
    expect(() => recordLoadedEsmFile('/no/such/file.mjs')).to.not.throw();
    expect([...(globalRecord[LOADED_ESM_FILES] ?? [])]).to.include('/no/such/file.mjs');
  });
});
