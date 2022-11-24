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
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
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
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
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
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
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
      helper.scopeHelper.reInitLocalScope();
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
  describe('components that imports itself', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile('bar/index.js', 'export const a = "b";');
      helper.fs.outputFile('bar/foo.js', `import { a } from '@${helper.scopes.remote}/bar';`);
      helper.command.add('bar');
      helper.command.link();
    });
    // @todo: maybe we should show a component-issue suggesting to fix the import statement
    it('should not add itself as a dependency', () => {
      const show = helper.command.showComponentParsed('bar');
      expect(show.dependencies).to.have.lengthOf(0);
    });
  });
  describe('deleting a dependency from the filesystem when the record is still in bitmap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.fs.deletePath('comp2');
      helper.fs.appendFile('comp1/index.js');
    });
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
  });
});
