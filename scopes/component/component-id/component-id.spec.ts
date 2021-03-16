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
});
