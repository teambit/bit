import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
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

describe('determineMainFile', () => {
  describe('user did not specify a main file', () => {
    it('should throw MissingMainFile when no file matches any strategy', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'foo1.js' }, { relativePath: 'foo2.js' }],
      });
      expect(() => determineMainFile(addedComponent, null)).to.throw(MissingMainFile);
    });
    it('should use the only file when the component has a single file', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'foo1.js' }],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('foo1.js');
    });
    it('should identify the closest index file as the main file when multiple index files exist', () => {
      const addedComponent = createAddedComponent({
        files: [
          { relativePath: 'exceptions/some-exception.js' },
          { relativePath: 'exceptions/index.js' },
          { relativePath: 'index.js' },
          { relativePath: 'foo.js' },
        ],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('index.js');
    });
    it('should resolve a file with the same name as the immediate directory when no index file exists', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar.js' }, { relativePath: 'foo.js' }],
        immediateDir: 'bar',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('bar.js');
    });
    it('should prefer an index file over a file with the same name as the immediate directory', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'bar.js' }, { relativePath: 'index.js' }],
        immediateDir: 'bar',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('index.js');
    });
    it('should resolve the angular entry point file', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'public-api.ts' }, { relativePath: 'foo.ts' }],
      });
      expect(determineMainFile(addedComponent, null)).to.equal('public-api.ts');
    });
    it('should keep the main file of the existing component-map', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'foo1.js' }, { relativePath: 'foo2.js' }],
      });
      const existingComponentMap = { mainFile: 'foo2.js', rootDir: 'bar' };
      // @ts-ignore only the mainFile and rootDir props are needed
      expect(determineMainFile(addedComponent, existingComponentMap)).to.equal('foo2.js');
    });
  });
  describe('user specified a main file', () => {
    it('should use the specified main file when it exists in the files', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'foo1.js' }, { relativePath: 'foo2.js' }],
        mainFile: 'foo2.js',
      });
      expect(determineMainFile(addedComponent, null)).to.equal('foo2.js');
    });
    it('should throw MissingMainFile when the specified main file is not in the files', () => {
      const addedComponent = createAddedComponent({
        files: [{ relativePath: 'foo1.js' }, { relativePath: 'foo2.js' }],
        mainFile: 'non-exist.js',
      });
      expect(() => determineMainFile(addedComponent, null)).to.throw(MissingMainFile);
    });
  });
});
