import { expect } from 'chai';
import { ComponentID } from './component-id';

describe('component id', () => {
  describe('namespace', () => {
    it('should return an empty string if no namespace', () => {
      const stringId = 'teambit.component/component-id@0.0.312';
      const componentId = ComponentID.fromString(stringId);
      expect(componentId.namespace).to.equal('');
    });
    it('should return the correct value for a namespace with length === 1', () => {
      const stringId = 'teambit.component/ui/component-status@0.0.312';
      const componentId = ComponentID.fromString(stringId);
      expect(componentId.namespace).to.equal('ui');
    });
    it('should return the correct value for namespace with length === 2', () => {
      const stringId = 'teambit.component/ui/data/component-status@0.0.312';
      const componentId = ComponentID.fromString(stringId);
      expect(componentId.namespace).to.equal('ui/data');
    });
    it('should return the correct namespace even without version in id', () => {
      const stringId = 'teambit.component/ui/data/component-status';
      const componentId = ComponentID.fromString(stringId);
      expect(componentId.namespace).to.equal('ui/data');
    });
  });

  describe('.isValidObject()', () => {
    it('should return true for valid object', () => {
      const obj = {
        name: 'josh',
        scope: 'world',
      };

      const result = ComponentID.isValidObject(obj);

      expect(result).to.equal(true);
    });
  });

  it('should return false for non objects', () => {
    expect(ComponentID.isValidObject(undefined)).to.equal(false);
    expect(ComponentID.isValidObject('a-string')).to.equal(false);
  });

  it('should return false when name is missing', () => {
    const obj = {
      scope: 'cats',
    };

    const result = ComponentID.isValidObject(obj);

    expect(result).to.equal(false);
  });

  it('should return false when scope is missing', () => {
    const obj = {
      name: 'bob',
    };

    const result = ComponentID.isValidObject(obj);

    expect(result).to.equal(false);
  });
});
