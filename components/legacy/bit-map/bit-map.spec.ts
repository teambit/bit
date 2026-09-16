import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import * as path from 'path';
import { ComponentID } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
import { logger } from '@teambit/legacy.logger';
import { BitMap } from './bit-map';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

const getBitmapInstance = async () => {
  return BitMap.load(__dirname, '');
};

const addComponentParamsFixture = {
  componentId: ComponentID.fromObject({ name: 'is-string' }, 'my-scope'),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  defaultScope: 'my-scope',
};

describe('BitMap', function () {
  // @ts-ignore
  logger.debug = () => {};
  // @ts-ignore
  logger.info = () => {};
  // @ts-ignore
  // this.timeout(0);
  describe('toObject', () => {
    let bitMap: BitMap;
    let componentMap;
    before(async () => {
      bitMap = await getBitmapInstance();
      bitMap.addComponent(addComponentParamsFixture);
      const allComponents = bitMap.toObjects();
      componentMap = allComponents['is-string'];
    });
    it('should remove the "id" property', () => {
      expect(componentMap).to.not.have.property('id');
    });
    it('should sort the components alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      exampleComponent.defaultScope = '';
      bitMap = await getBitmapInstance();
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string1', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string3', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string2', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const ids = Object.keys(allComponents);
      expect(ids[0]).to.equal('is-string1');
      expect(ids[1]).to.equal('is-string2');
      expect(ids[2]).to.equal('is-string3');
    });
  });
  describe('loadComponents', () => {
    let bitMap: BitMap;
    before(async () => {
      bitMap = await getBitmapInstance();
    });
    it('should throw DuplicateRootDir error when multiple ids have the same rootDir', () => {
      const invalidBitMap = {
        comp1: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
        comp2: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(DuplicateRootDir);
    });
    it('should throw when a component has scope but not version', () => {
      const invalidBitMap = {
        'scope/comp1': {
          mainFile: 'index.js',
          scope: 'scope',
          rootDir: 'comp1',
          exported: true,
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(
        '.bitmap entry of "scope/comp1" is invalid, it has a scope-name "scope", however, it does not have any version'
      );
    });
  });
  describe('trackDirectoryChanges', () => {
    const compId = ComponentID.fromObject({ name: 'comp1' }, 'my-scope');
    let workspaceDir: string;
    let bitMap: BitMap;
    const resolve = (filePath: string) => bitMap.getComponentIdByPath(filePath)?.toString();
    beforeEach(async () => {
      workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-map-spec-'));
      await fs.outputFile(path.join(workspaceDir, 'comp1/index.js'), '');
      bitMap = await BitMap.load(workspaceDir, 'my-scope');
      bitMap.loadComponents({ comp1: { scope: '', mainFile: 'index.js', rootDir: 'comp1' } }, 'my-scope');
      await bitMap.loadFiles();
    });
    afterEach(async () => {
      await fs.remove(workspaceDir);
    });
    it('should resolve a file added to the rootDir when the paths index was already built', async () => {
      expect(resolve('comp1/index.js')).to.equal(compId.toString());
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
    });
    it('should stop resolving a file removed from the rootDir', async () => {
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
      await fs.remove(path.join(workspaceDir, 'comp1/new-file.js'));
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/new-file.js')).to.be.undefined;
    });
    it('should keep the existing files resolvable when the paths index was not built yet', async () => {
      await fs.outputFile(path.join(workspaceDir, 'comp1/new-file.js'), '');
      await bitMap.trackDirectoryChanges(bitMap.getComponent(compId));
      expect(resolve('comp1/index.js')).to.equal(compId.toString());
      expect(resolve('comp1/new-file.js')).to.equal(compId.toString());
    });
  });
});
