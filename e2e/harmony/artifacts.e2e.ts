import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('bit artifacts command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('staged component that was never exported', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
    });
    it('should not throw an error about missing scope', () => {
      expect(() => helper.command.artifacts('comp1')).to.not.throw();
    });
    it('should be able to work when using the full component-id', () => {
      expect(() => helper.command.artifacts(`${helper.scopes.remote}/comp1`)).to.not.throw();
    });
  });
  describe('running the command on a snap', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponents();
    });
    it('should not throw an error about non exist component', () => {
      const head = helper.command.getHead('comp1');
      expect(() => helper.command.artifacts(`comp1@${head}`)).to.not.throw();
    });
  });
});
