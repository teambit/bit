import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit remove command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('recover command', () => {
    describe('recover before snapping', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(2);
        helper.command.tagWithoutBuild();
        helper.command.export();

        helper.command.softRemoveComponent('comp2');
        helper.command.recover('comp2');
      });
      it('bit status should not show a section of removed components', () => {
        const status = helper.command.statusJson();
        expect(status.locallySoftRemoved).to.have.lengthOf(0);
      });
      it('bit status should not show the dependent component with an issue because the dependency is now back to the workspace', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
      });
      it('bit list should show the removed component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
    });
    describe('recover after snapping', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(2);
        helper.command.tagWithoutBuild();
        helper.command.export();

        helper.command.softRemoveComponent('comp2');
        helper.fs.outputFile('comp1/index.js', '');
        helper.command.tagAllWithoutBuild();
        helper.command.recover(`${helper.scopes.remote}/comp2`);
      });
      it('should put it back in .bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2).to.not.be.undefined;
      });
      it('bit status should not show the component as remotelySoftRemoved', () => {
        const status = helper.command.statusJson();
        expect(status.remotelySoftRemoved).to.have.lengthOf(0);
      });
      it('bit list should show the component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
    });
  });
});
