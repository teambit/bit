import { IssuesClasses } from '@teambit/component-issues';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('status command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('main filename is not index and dists are missing', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.outputFile('comp1/comp1.ts', "require('@my-scope/comp2');");
      helper.fs.outputFile('comp2/comp2.ts');
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.link();
    });
    it('should not show an issue of missing-packages', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
  });
  describe('dists dir is deleted after caching the components', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // to populate the cache
      // as an intermediate step, make sure the missing-dist is not an issue.
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingDists.name);
      const distDir = 'node_modules/@my-scope/comp1/dist';
      helper.fs.deletePath(distDir);
    });
    it('should show an issue of missing-dists', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingDists.name);
    });
    it('should exit with non zero exit-code if --strict flag is used', () => {
      let error;
      try {
        helper.command.runCmd('bit status --strict');
      } catch (err: any) {
        error = err;
      }
      expect(error.status).to.equal(1);
    });
  });
  describe('package dir is deleted from node-modules', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // to populate the cache
      // as an intermediate step, make sure the missing-links is not an issue.
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingLinksFromNodeModulesToSrc.name);
      const pkgDir = 'node_modules/@my-scope/comp1';
      helper.fs.deletePath(pkgDir);
    });
    it('should show an issue of missing-links-from-node-modules-to-src', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingLinksFromNodeModulesToSrc.name);
    });
  });
  describe('components that are both: new and auto-tag-pending', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3');
      helper.fixtures.populateComponents(3, undefined, 'v2');
    });
    it('should be shown in the newComponents section only and not in the autoTagPendingComponents', () => {
      const status = helper.command.statusJson();
      expect(status.autoTagPendingComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(2);
    });
  });
});
