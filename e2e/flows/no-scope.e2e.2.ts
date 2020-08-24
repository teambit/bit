import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('import/require using module paths when no scope is set', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic flow', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponentsAndModulePath(false);
      helper.command.runCmd('bit link');
    });
    it('bit status should not break', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).have.lengthOf(3);
      expect(status.invalidComponents).have.lengthOf(0);
    });
    describe('tagging the components', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagAllComponents();
      });
      it('should be able to to tag them successfully', () => {
        expect(tagOutput).to.have.string('tagged');
      });
      it('bit status should not show any issue', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).have.lengthOf(3);
        expect(status.newComponents).have.lengthOf(0);
        expect(status.modifiedComponent).have.lengthOf(0);
        expect(status.invalidComponents).have.lengthOf(0);
      });
      describe('exporting the components', () => {
        describe('without --rewire flag', () => {
          it('should throw an error preventing the user to export no-scope components', () => {
            const output = helper.general.runWithTryCatch(`bit export ${helper.scopes.remote}`);
            expect(output).to.have.string('please use "--rewire" flag to fix the import/require statements');
          });
        });
        describe('with --rewire flag', () => {
          before(() => {
            helper.command.export(`${helper.scopes.remote} --rewire`);
          });
          it('should be able to export them all successfully', () => {
            const status = helper.command.statusJson();
            expect(status.stagedComponents).have.lengthOf(0);
            expect(status.newComponents).have.lengthOf(0);
            expect(status.modifiedComponent).have.lengthOf(0);
            expect(status.invalidComponents).have.lengthOf(0);
          });
          it('should change the source code to include the scope-name in the require statement', () => {
            const barFoo = helper.fs.readFile('bar/foo.js');
            expect(barFoo).to.have.string(`require('@bit/${helper.scopes.remote}.utils.is-string')`);
            expect(barFoo).to.not.have.string("require('@bit/utils.is-string')");
          });
          describe('importing the components', () => {
            before(() => {
              helper.scopeHelper.reInitLocalScope();
              helper.scopeHelper.addRemoteScope();
              helper.command.importComponent('bar/foo');
            });
            it('the project should be running while the components are able to require each other', () => {
              helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-type and got is-string and got foo');
            });
          });
        });
      });
    });
  });
});
