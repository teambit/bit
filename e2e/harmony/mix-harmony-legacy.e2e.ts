import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('mix use of Legacy and Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('legacy component into Harmony workspace', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const remoteName = '14epy6hr-remote';
      const remotePath = helper.scopeHelper.getNewBareScopeWithSpecificName(remoteName);
      helper.scopeHelper.addRemoteScope(remotePath);
      helper.scopes.setRemoteScope(undefined, undefined, remoteName);
      helper.fixtures.extractCompressedFixture('scopes/legacy-remote.tgz', helper.scopes.e2eDir);
    });
    it('should block importing the component', () => {
      expect(() => helper.command.importComponent('bar/foo')).to.throw('unable to write component');
    });
    describe('re-creating the component in Harmony using the legacy objects', () => {
      before(() => {
        helper.command.importComponent('bar/foo --objects');
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.command.addComponent('bar', { i: 'bar/foo' });
      });
      it('bit status should show an issue of LegacyInsideHarmony', () => {
        helper.command.expectStatusToHaveIssue(IssuesClasses.LegacyInsideHarmony.name);
      });
      it('bit tag should throw an error', () => {
        expect(() => helper.command.tagAllComponents()).to.throw('error: issues found');
      });
    });
  });
});
