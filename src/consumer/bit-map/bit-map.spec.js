import { expect } from 'chai';
import BitMap from './bit-map';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';

const addComponentParamsFixture = {
  componentId: new BitId({ name: 'is-string' }),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  origin: COMPONENT_ORIGINS.AUTHORED
};

const addComponentParamsImportedFixture = {
  componentId: new BitId({ scope: 'my-scope', name: 'is-string-imported', version: '0.0.1' }),
  files: [{ name: 'is-string-imported.js', relativePath: 'is-string-imported.js', test: false }],
  mainFile: 'is-string-imported.js',
  origin: COMPONENT_ORIGINS.IMPORTED,
  rootDir: 'utils'
};

describe('BitMap', () => {
  describe('toObject', () => {
    let bitMap;
    let componentMap;
    before(() => {
      bitMap = BitMap.load(__dirname);
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
  });
});
