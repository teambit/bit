import { expect } from 'chai';
import ScopeIndex from './components-index';
import { BitId } from '../../bit-id';
import { ModelComponent, Symlink } from '../models';
import BitObject from './object';

describe('ComponentsIndex', () => {
  describe('addOne', () => {
    let scopeIndex;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
    });
    it('should add to the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      const allIds = scopeIndex.getIds();
      const id = new BitId({ scope: 'my-scope', name: 'is-string' });
      expect(allIds[0]).to.deep.equal(id);
    });
    it('should not add the same component multiple times', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      scopeIndex.addOne(modelComponent);
      scopeIndex.addOne(modelComponent);
      expect(scopeIndex.getIds()).to.have.lengthOf(1);
    });
    it('should not add BitObjects that are not Symlink nor ModelComponent', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const bitObject = new BitObject({ scope: 'my-scope', name: 'is-string' });
      const result = scopeIndex.addOne(bitObject);
      expect(scopeIndex.getIds()).to.have.lengthOf(0);
      expect(result).to.be.false;
    });
  });
  describe('remove', () => {
    let scopeIndex;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
    });
    it('should remove from the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      expect(scopeIndex.getIds()).to.have.lengthOf(1);
      scopeIndex.removeOne(modelComponent.hash().toString());
      expect(scopeIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove the correct one when there are multiple', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isStringComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isTypeComponent = new ModelComponent({ scope: 'my-scope', name: 'is-type' });
      scopeIndex.addOne(isStringComponent);
      scopeIndex.addOne(isTypeComponent);
      expect(scopeIndex.getIds()).to.have.lengthOf(2);
      scopeIndex.removeOne(isStringComponent.hash().toString());
      const allIds = scopeIndex.getIds();
      expect(allIds).to.have.lengthOf(1);
      const id = new BitId({ scope: 'my-scope', name: 'is-type' });
      expect(allIds[0]).to.deep.equal(id);
    });
  });
  describe('removeMany', () => {
    let scopeIndex;
    let isStringComponent;
    let isTypeComponent;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isStringComponent = new ModelComponent({ name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isTypeComponent = new ModelComponent({ name: 'is-type' });
      scopeIndex.addMany([isStringComponent, isTypeComponent]);
      expect(scopeIndex.getIds()).to.have.lengthOf(2);
    });
    it('should remove multiple when removing them at the same removeMany call', () => {
      expect(scopeIndex.getIds()).to.have.lengthOf(2);
      scopeIndex.removeMany([isStringComponent.hash().toString(), isTypeComponent.hash().toString()]);
      expect(scopeIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove multiple when removing them with separate removeMany calls', () => {
      expect(scopeIndex.getIds()).to.have.lengthOf(2);
      scopeIndex.removeMany([isStringComponent.hash().toString()]);
      scopeIndex.removeMany([isTypeComponent.hash().toString()]);
      expect(scopeIndex.getIds()).to.have.lengthOf(0);
    });
    it('should remove multiple when calling them with separate removeMany calls using array.map', () => {
      expect(scopeIndex.getIds()).to.have.lengthOf(2);
      [isStringComponent.hash().toString(), isTypeComponent.hash().toString()].map(h => scopeIndex.removeMany([h]));
      expect(scopeIndex.getIds()).to.have.lengthOf(0);
    });
  });
});
