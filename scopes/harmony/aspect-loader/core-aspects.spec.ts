import { expect } from 'chai';
import { getCoreAspectName, getNonCorePackageName } from './core-aspects';

describe('core-aspects', () => {
  describe('getCoreAspectName', () => {
    it('should include the namespace in the aspect name', () => {
      const aspectName = getCoreAspectName('teambit.workspace/e2e/workspace');
      expect(aspectName).to.equal('e2e.workspace');
    });
  });
  describe('getNonCorePackageName', () => {
    it('should split a scope that has an owner into the npm scope and the first name segment', () => {
      expect(getNonCorePackageName('teambit.react/react')).to.equal('@teambit/react.react');
    });
    it('should keep the namespaces of the component in the name', () => {
      expect(getNonCorePackageName('my-org.design/ui/button')).to.equal('@my-org/design.ui.button');
    });
    it('should use a scope without an owner as the npm scope on its own', () => {
      expect(getNonCorePackageName('my-scope/ui/button')).to.equal('@my-scope/ui.button');
    });
  });
});
