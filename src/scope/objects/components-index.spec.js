import { expect } from 'chai';
import ComponentsIndex from './components-index';
import { BitId } from '../../bit-id';
import { ModelComponent, Symlink } from '../models';
import BitObject from './object';

describe('ComponentsIndex', () => {
  describe('addOne', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should add to the index array', () => {
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      const allIds = componentsIndex.getIds();
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      expect(allIds[0]).to.deep.equal(id);
    });
    it('should not add the same component multiple times', () => {
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      componentsIndex.addOne(modelComponent);
      componentsIndex.addOne(modelComponent);
      expect(componentsIndex.getIds()).to.have.lengthOf(1);
    });
    it('should not add BitObjects that are not Symlink nor ModelComponent', () => {
      const bitObject = new BitObject({ scope: 'my-scope', name: 'is-string' });
      const result = componentsIndex.addOne(bitObject);
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
      expect(result).to.be.false;
    });
  });
  describe('remove', () => {
    let componentsIndex;
    before(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should remove from the index array', () => {
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      expect(componentsIndex.getIds()).to.have.lengthOf(1);
      componentsIndex.remove(modelComponent.hash().toString());
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
  });
  describe('getIds', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should not return symlinks', () => {
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.addOne(symlink);
      const allIds = componentsIndex.getIds();
      expect(allIds).to.have.lengthOf(0);
    });
  });
  describe('getIdsIncludesSymlinks', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should return symlinks', () => {
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.addOne(symlink);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(1);
    });
    it('should return components and symlinks if both exist', () => {
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addMany([symlink, modelComponent]);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(2);
    });
  });
});
