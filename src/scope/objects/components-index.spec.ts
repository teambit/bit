import { expect } from 'chai';
import ComponentsIndex from './components-index';
import { BitId } from '../../bit-id';
import { ModelComponent, Symlink } from '../models';
import BitObject from './object';

describe('ComponentsIndex', () => {
  describe('addOne', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex('scope-path');
    });
    it('should add to the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      const allIds = componentsIndex.getIds();
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      expect(allIds[0]).to.deep.equal(id);
    });
    it('should not add the same component multiple times', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      componentsIndex.addOne(modelComponent);
      componentsIndex.addOne(modelComponent);
      expect(componentsIndex.getIds()).to.have.lengthOf(1);
    });
    it('should not add BitObjects that are not Symlink nor ModelComponent', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const bitObject = new BitObject({ scope: 'my-scope', name: 'is-string' });
      const result = componentsIndex.addOne(bitObject);
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
      expect(result).to.be.false;
    });
  });
  describe('remove', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex('scope-path');
    });
    it('should remove from the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addOne(modelComponent);
      expect(componentsIndex.getIds()).to.have.lengthOf(1);
      componentsIndex.removeOne(modelComponent.hash().toString());
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove the correct one when there are multiple', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isStringComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isTypeComponent = new ModelComponent({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.addOne(isStringComponent);
      componentsIndex.addOne(isTypeComponent);
      expect(componentsIndex.getIds()).to.have.lengthOf(2);
      componentsIndex.removeOne(isStringComponent.hash().toString());
      const allIds = componentsIndex.getIds();
      expect(allIds).to.have.lengthOf(1);
      const id = new BitId({ scope: 'my-scope', name: 'is-type' });
      expect(allIds[0]).to.deep.equal(id);
    });
  });
  describe('removeMany', () => {
    let componentsIndex;
    let isStringComponent;
    let isTypeComponent;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex('scope-path');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isStringComponent = new ModelComponent({ name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isTypeComponent = new ModelComponent({ name: 'is-type' });
      componentsIndex.addMany([isStringComponent, isTypeComponent]);
      expect(componentsIndex.getIds()).to.have.lengthOf(2);
    });
    it('should remove multiple when removing them at the same removeMany call', () => {
      expect(componentsIndex.getIds()).to.have.lengthOf(2);
      componentsIndex.removeMany([isStringComponent.hash().toString(), isTypeComponent.hash().toString()]);
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove multiple when removing them with separate removeMany calls', () => {
      expect(componentsIndex.getIds()).to.have.lengthOf(2);
      componentsIndex.removeMany([isStringComponent.hash().toString()]);
      componentsIndex.removeMany([isTypeComponent.hash().toString()]);
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove multiple when calling them with separate removeMany calls using array.map', () => {
      expect(componentsIndex.getIds()).to.have.lengthOf(2);
      [isStringComponent.hash().toString(), isTypeComponent.hash().toString()].map(h =>
        componentsIndex.removeMany([h])
      );
      expect(componentsIndex.getIds()).to.have.lengthOf(0);
    });
  });
  describe('getIds', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex('scope-path');
    });
    it('should not return symlinks', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.addOne(symlink);
      const allIds = componentsIndex.getIds();
      expect(allIds).to.have.lengthOf(0);
    });
  });
  describe('getIdsIncludesSymlinks', () => {
    let componentsIndex;
    beforeEach(() => {
      componentsIndex = new ComponentsIndex('scope-path');
    });
    it('should return symlinks', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      componentsIndex.addOne(symlink);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(1);
    });
    it('should return components and symlinks if both exist', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const symlink = new Symlink({ scope: 'my-scope', name: 'is-type' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      componentsIndex.addMany([symlink, modelComponent]);
      const allIds = componentsIndex.getIdsIncludesSymlinks();
      expect(allIds).to.have.lengthOf(2);
    });
  });
});
