import * as path from 'path';
import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { DEFAULT_INDEX_EXTS, DEFAULT_INDEX_NAME } from '@teambit/legacy.constants';
import type { ComponentMap } from '@teambit/legacy.bit-map';
import { MissingMainFile } from '@teambit/legacy.bit-map';
import determineMainFile from './determine-main-file';
import type { AddedComponent } from './add-components';

const createAddedComponent = (overrides: Partial<AddedComponent> = {}): AddedComponent => ({
  componentId: ComponentID.fromObject({ name: 'bar/foo' }, 'my-scope'),
  files: [],
  mainFile: undefined,
  trackDir: 'bar',
  idFromPath: undefined,
  ...overrides,
});

/**
 * the thrown error carries the component-id, the expected main-file pattern and the file list,
 * all assembled separately from the exception type - so assert on them rather than on the class
 * alone, otherwise a regression in any of those details still passes.
 */
const expectToThrowMissingMainFile = (
  addedComponent: AddedComponent,
  expectedMainFile: string,
  expectedFiles: string[]
) => {
  let error: MissingMainFile | undefined;
  try {
    determineMainFile(addedComponent, null);
  } catch (err: any) {
    error = err;
  }
  expect(error).to.be.an.instanceOf(MissingMainFile);
  expect(error?.componentId).to.equal('my-scope/bar/foo');
  expect(error?.mainFile).to.equal(expectedMainFile);
  expect(error?.files).to.deep.equal(expectedFiles.map((file) => path.normalize(file)));
  expect(error?.message).to.have.string('does not contain a main file');
  expect(error?.message).to.have.string('my-scope/bar/foo');
};

// the pattern reported when no strategy matched, e.g. "index.[js, ts, ...]"
const indexMainFilePattern = `${DEFAULT_INDEX_NAME}.[${DEFAULT_INDEX_EXTS.join(', ')}]`;

describe('determineMainFile', () => {
  describe('user did not specify a main file', () => {
    it('should throw MissingMainFile with the component details when no file matches any strategy', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/foo1.js' }, { relativePath: 'bar/foo2.js' }],
      });
      expectToThrowMissingMainFile(addedComponent, indexMainFilePattern, ['bar/foo1.js', 'bar/foo2.js']);
    });
    it('should use the only file when the component has a single file', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/foo1.js' }],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/foo1.js');
    });
    it('should identify the closest index file as the main file when multiple index files exist', () => {
      const addedComponent = createAddedComponent({
        files: [
          { relativePath: 'bar/exceptions/some-exception.js' },
          { relativePath: 'bar/exceptions/index.js' },
          { relativePath: 'bar/index.js' },
          { relativePath: 'bar/foo.js' },
        ],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/index.js');
    });
    it('should resolve a file with the same name as the immediate directory when no index file exists', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/bar.js' }, { relativePath: 'bar/foo.js' }],
        immediateDir: 'bar',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/bar.js');
    });
    it('should prefer an index file over a file with the same name as the immediate directory', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/bar.js' }, { relativePath: 'bar/index.js' }],
        immediateDir: 'bar',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/index.js');
    });
    it('should resolve the angular entry point file', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/public-api.ts' }, { relativePath: 'bar/foo.ts' }],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/public-api.ts');
    });
    it('should keep the main file of the existing component-map', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/foo1.js' }, { relativePath: 'bar/foo2.js' }],
      });
      // only mainFile and rootDir are read by the strategy, so a partial map is enough here
      const existingComponentMap = { mainFile: 'foo2.js', rootDir: 'bar' } as ComponentMap;
      expect(determineMainFile(addedComponent, existingComponentMap)).to.equal('foo2.js');
    });
  });
  describe('user specified a main file', () => {
    it('should use the specified main file when it exists in the files', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/foo1.js' }, { relativePath: 'bar/foo2.js' }],
        mainFile: 'bar/foo2.js',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar/foo2.js');
    });
    it('should throw MissingMainFile with the component details when the specified main file is not in the files', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar/foo1.js' }, { relativePath: 'bar/foo2.js' }],
        mainFile: 'non-exist.js',
      });
      // the user's value is reported as-is here, not the index pattern
      expectToThrowMissingMainFile(addedComponent, 'non-exist.js', ['bar/foo1.js', 'bar/foo2.js']);
    });
  });
});
