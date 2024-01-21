import { expect } from 'chai';
import { getCoreAspectName } from './core-aspects';

describe('core-aspects', () => {
  describe('getCoreAspectName', () => {
    it('should include the namespace in the aspect name', () => {
      const aspectName = getCoreAspectName('teambit.workspace/e2e/workspace');
      expect(aspectName).to.equal('e2e.workspace');
    });
  });
});
