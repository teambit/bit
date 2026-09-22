import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { ComponentMap, ComponentMapFile } from '@teambit/legacy.bit-map';
import determineMainFile from './determine-main-file';
import type { AddedComponent } from './add-components';

const toFiles = (paths: string[]): ComponentMapFile[] =>
  paths.map((relativePath) => ({ relativePath, test: false, name: relativePath.split('/').pop() as string }));

const addedComponent = (trackDir: string, files: string[], mainFile?: string): AddedComponent => ({
  componentId: ComponentID.fromObject({ name: 'comp' }, 'my-scope'),
  files: toFiles(files),
  mainFile,
  trackDir,
  idFromPath: null,
  immediateDir: trackDir.split('/').pop(),
});

describe('determineMainFile', () => {
  describe('the workspace root', () => {
    // an index file at the root and a deeper one: neither is the entry point of a workspace
    const rootFiles = ['.bitmap', 'README.md', 'index.ts', 'scripts/index.js', 'workspace.jsonc'];
    it('should default to workspace.jsonc, over the index files', () => {
      expect(determineMainFile(addedComponent('.', rootFiles), null)).to.equal('workspace.jsonc');
    });
    it('should take the main file the user gave over the default', () => {
      expect(determineMainFile(addedComponent('.', rootFiles, 'README.md'), null)).to.equal('README.md');
    });
    it('should keep the main file of the existing entry when re-tracked without one', () => {
      const existing = { rootDir: '.', mainFile: 'README.md' } as ComponentMap;
      expect(determineMainFile(addedComponent('.', rootFiles), existing)).to.equal('README.md');
    });
  });
  describe('a regular directory', () => {
    it('should resolve the index file, a workspace.jsonc inside it is a file like any other', () => {
      const files = ['packages/comp1/index.ts', 'packages/comp1/workspace.jsonc'];
      expect(determineMainFile(addedComponent('packages/comp1', files), null)).to.equal('packages/comp1/index.ts');
    });
  });
});
