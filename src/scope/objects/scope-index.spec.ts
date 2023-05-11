import { expect } from 'chai';

import { ModelComponent } from '../models';
import ScopeIndex from './components-index';
import BitObject from './object';

describe('ComponentsIndex', () => {
  describe('addOne', () => {
    let scopeIndex: ScopeIndex;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
    });
    it('should add to the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      const allItems = scopeIndex.getAll();
      // @ts-ignore
      expect(allItems[0].id).to.deep.equal({ scope: 'my-scope', name: 'is-string' });
    });
    it('should not add the same component multiple times', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      scopeIndex.addOne(modelComponent);
      scopeIndex.addOne(modelComponent);
      expect(scopeIndex.getAll()).to.have.lengthOf(1);
    });
    it('should not add BitObjects that are not Symlink nor ModelComponent', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const bitObject = new BitObject({ scope: 'my-scope', name: 'is-string' });
      const result = scopeIndex.addOne(bitObject);
      expect(scopeIndex.getAll()).to.have.lengthOf(0);
      expect(result).to.be.false;
    });
  });
  describe('remove', () => {
    let scopeIndex: ScopeIndex;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
    });
    it('should remove from the index array', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const modelComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      scopeIndex.addOne(modelComponent);
      expect(scopeIndex.getAll()).to.have.lengthOf(1);
      scopeIndex.removeOne(modelComponent.hash().toString());
      expect(scopeIndex.getAll()).to.have.lengthOf(0);
    });
    it('should remove the correct one when there are multiple', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isStringComponent = new ModelComponent({ scope: 'my-scope', name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const isTypeComponent = new ModelComponent({ scope: 'my-scope', name: 'is-type' });
      scopeIndex.addOne(isStringComponent);
      scopeIndex.addOne(isTypeComponent);
      expect(scopeIndex.getAll()).to.have.lengthOf(2);
      scopeIndex.removeOne(isStringComponent.hash().toString());
      const allIds = scopeIndex.getAll();
      expect(allIds).to.have.lengthOf(1);
      // @ts-ignore
      expect(allIds[0].id).to.deep.equal({ scope: 'my-scope', name: 'is-type' });
    });
  });
  describe('removeMany', () => {
    let scopeIndex: ScopeIndex;
    let isStringComponent;
    let isTypeComponent;
    beforeEach(() => {
      scopeIndex = new ScopeIndex('scope-path');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isStringComponent = new ModelComponent({ name: 'is-string' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      isTypeComponent = new ModelComponent({ name: 'is-type' });
      scopeIndex.addMany([isStringComponent, isTypeComponent]);
      expect(scopeIndex.getAll()).to.have.lengthOf(2);
    });
    it('should remove multiple when removing them at the same removeMany call', () => {
      expect(scopeIndex.getAll()).to.have.lengthOf(2);
      scopeIndex.removeMany([isStringComponent.hash().toString(), isTypeComponent.hash().toString()]);
      expect(scopeIndex.getAll()).to.have.lengthOf(0);
    });
    it('should remove multiple when removing them with separate removeMany calls', () => {
      expect(scopeIndex.getAll()).to.have.lengthOf(2);
      scopeIndex.removeMany([isStringComponent.hash().toString()]);
      scopeIndex.removeMany([isTypeComponent.hash().toString()]);
      expect(scopeIndex.getAll()).to.have.lengthOf(0);
    });
    it('should remove multiple when calling them with separate removeMany calls using array.map', () => {
      expect(scopeIndex.getAll()).to.have.lengthOf(2);
      [isStringComponent.hash().toString(), isTypeComponent.hash().toString()].map((h) => scopeIndex.removeMany([h]));
      expect(scopeIndex.getAll()).to.have.lengthOf(0);
    });
  });
});
