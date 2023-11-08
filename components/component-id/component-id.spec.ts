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

  describe('equality', () => {
    it('should equal when both are undefined', () => {
      expect(ComponentID.isEqual(undefined, undefined)).to.be.true;
      expect(ComponentID.isEqualObj(undefined, undefined)).to.be.true;
    });

    it('should not equal when one is undefined', () => {
      const bObj = { name: 'button', scope: 'base-ui' };
      const bId = ComponentID.fromObject({ name: 'button', scope: 'base-ui' });

      expect(ComponentID.isEqual(undefined, bId)).to.be.false;
      expect(ComponentID.isEqualObj(undefined, bObj)).to.be.false;
    });

    it('should equal when name and scope match', () => {
      const aObj = { name: 'button', scope: 'base-ui' };
      const aId = ComponentID.fromObject(aObj);
      const bObj = { name: 'button', scope: 'base-ui' };
      const bId = ComponentID.fromObject(bObj);

      expect(ComponentID.isEqual(aId, bId)).to.be.true;
      expect(ComponentID.isEqualObj(aId, bId)).to.be.true;
      expect(aId.isEqual(bId)).to.be.true;
    });

    it('should equal when versions dont match, but ignored by options', () => {
      const aObj = { name: 'button', scope: 'base-ui', version: '0.0.1' };
      const aId = ComponentID.fromObject(aObj);
      const bObj = { name: 'button', scope: 'base-ui', version: '0.0.2' };
      const bId = ComponentID.fromObject(bObj);

      expect(ComponentID.isEqual(aId, bId, { ignoreVersion: true })).to.be.true;
      expect(ComponentID.isEqualObj(aObj, bObj, { ignoreVersion: true })).to.be.true;
      expect(aId.isEqual(bId, { ignoreVersion: true })).to.be.true;
    });

    it('should not equal when versions dont match', () => {
      const aObj = { name: 'button', scope: 'base-ui', version: '0.0.1' };
      const aId = ComponentID.fromObject(aObj);
      const bObj = { name: 'button', scope: 'base-ui', version: '0.0.2' };
      const bId = ComponentID.fromObject(bObj);

      expect(ComponentID.isEqual(aId, bId)).to.be.false;
      expect(ComponentID.isEqualObj(aObj, bObj)).to.be.false;
      expect(aId.isEqual(bId)).to.be.false;
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
