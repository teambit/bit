import { expect } from 'chai';
import * as path from 'path';

import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import BitMap from './bit-map';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

const scope = {
  path: path.join(__dirname, '.bit'),
  lanes: { getCurrentLaneName: () => 'main' },
};

const getBitmapInstance = async () => {
  const consumer = { getPath: () => __dirname, isLegacy: false, scope };
  // @ts-ignore
  return BitMap.load(consumer);
};

const addComponentParamsFixture = {
  componentId: new BitId({ name: 'is-string' }),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  origin: COMPONENT_ORIGINS.AUTHORED,
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
});
