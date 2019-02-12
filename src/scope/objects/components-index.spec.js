import { expect } from 'chai';
import ComponentsIndex from './components-index';
import { BitId } from '../../bit-id';

describe.skip('ComponentsIndex', () => {
  describe('add', () => {
    let componentsIndex;
    before(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should add to the index array', () => {
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.add(id);
      const allIds = componentsIndex.getIds();
      expect(allIds[0]).to.deep.equal(id);
    });
  });
  describe('remove', () => {
    let componentsIndex;
    before(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should remove from the index array', () => {
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.add(id);
      expect(componentsIndex.getIds()).to.have.lengthOf(1);
      componentsIndex.remove(id);
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
  });
  describe('getIds', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex([], 'scope-path');
    });
    it('should not return symlinks', () => {
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.add(id, true);
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
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.add(id, true);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(1);
    });
    it('should return components and symlinks if both exist', () => {
      const id1 = new BitId({ scope: 'my-scope', name: 'is-string' });
      const id2 = new BitId({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.add(id1, true);
      componentsIndex.add(id2, false);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(2);
    });
  });
});
