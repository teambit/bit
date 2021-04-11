import { expect } from 'chai';
import * as path from 'path';

import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import BitMap from './bit-map';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

const scope = {
  path: path.join(__dirname, '.bit'),
  lanes: { getCurrentLaneName: () => 'master' },
};

const bitMapFixtureDir = path.join(__dirname, '../../../fixtures/bitmap-fixtures');
const getBitmapInstance = async () => {
  const consumer = { getPath: () => __dirname, isLegacy: true, scope };
  // @ts-ignore
  return BitMap.load(consumer);
};

const addComponentParamsFixture = {
  componentId: new BitId({ name: 'is-string' }),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  origin: COMPONENT_ORIGINS.AUTHORED,
};

const addComponentParamsImportedFixture = {
  componentId: new BitId({ scope: 'my-scope', name: 'is-string-imported', version: '0.0.1' }),
  files: [{ name: 'is-string-imported.js', relativePath: 'is-string-imported.js', test: false }],
  mainFile: 'is-string-imported.js',
  origin: COMPONENT_ORIGINS.IMPORTED,
  rootDir: 'utils',
};

describe('BitMap', function () {
  // @ts-ignore
  logger.debug = () => {};
  // @ts-ignore
  logger.info = () => {};
  this.timeout(0);
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
    it('should add "exported" property to authored components', () => {
      expect(componentMap).to.have.property('exported');
      expect(componentMap.exported).to.be.false;
    });
    it('should not add "exported" property to imported components', () => {
      bitMap.addComponent(addComponentParamsImportedFixture);
      const allComponents = bitMap.toObjects();
      const componentMapImported = allComponents['my-scope/is-string-imported@0.0.1'];
      expect(componentMapImported).to.not.have.property('exported');
    });
    it('should sort the components alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      bitMap = await getBitmapInstance();
      exampleComponent.componentId = new BitId({ scope: 'my-scope', name: 'is-string1', version: '0.0.1' });
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new BitId({ scope: 'my-scope', name: 'is-string3', version: '0.0.1' });
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new BitId({ scope: 'my-scope', name: 'is-string2', version: '0.0.1' });
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const ids = Object.keys(allComponents);
      expect(ids[0]).to.equal('my-scope/is-string1@0.0.1');
      expect(ids[1]).to.equal('my-scope/is-string2@0.0.1');
      expect(ids[2]).to.equal('my-scope/is-string3@0.0.1');
    });
    it('should sort the files in the component alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      bitMap = await getBitmapInstance();
      exampleComponent.files = [
        { name: 'is-string1.js', relativePath: 'is-string1.js', test: false },
        { name: 'is-string3.js', relativePath: 'is-string3.js', test: false },
        { name: 'is-string2.js', relativePath: 'is-string2.js', test: false },
      ];
      exampleComponent.mainFile = 'is-string2.js';
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const files = allComponents['is-string'].files;
      expect(files[0].relativePath).to.equal('is-string1.js');
      expect(files[1].relativePath).to.equal('is-string2.js');
      expect(files[2].relativePath).to.equal('is-string3.js');
    });
    it('should sort the fields in the component files alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      bitMap = await getBitmapInstance();
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const files = allComponents['is-string'].files;
      const fields = Object.keys(files[0]);
      expect(fields[0]).to.equal('name');
      expect(fields[1]).to.equal('relativePath');
      expect(fields[2]).to.equal('test');
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
      expect(() => bitMap.loadComponents(invalidBitMap)).to.throw(DuplicateRootDir);
    });
    it('should throw when a component has scope but not version', () => {
      const invalidBitMap = {
        'scope/comp1': {
          mainFile: 'index.js',
          rootDir: 'comp1',
          exported: true,
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap)).to.throw(
        '.bitmap entry of "scope/comp1" is invalid, it has a scope-name "scope", however, it does not have any version'
      );
    });
  });
  describe('getAuthoredExportedComponents', () => {
    it('should return an empty array when there are no authored components', async () => {
      const consumer = {
        getPath: () => path.join(bitMapFixtureDir, 'only-imported'),
        isLegacy: true,
        scope,
      };
      // @ts-ignore
      const bitMap = await BitMap.load(consumer);
      const results = bitMap.getAuthoredExportedComponents();
      expect(results).to.be.an('array');
      expect(results).to.have.lengthOf(0);
    });
  });
});
