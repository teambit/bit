import { expect } from 'chai';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HttpHelper } from '../http-helper';

// @TODO: fix for Windows
(IS_WINDOWS ? describe.skip : describe)('http protocol', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  let httpHelper: HttpHelper;
  describe('export lane', () => {
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
    });
    it('lane list -r --json should show the remote lanes', () => {
      const output = helper.command.listRemoteLanesParsed();
      expect(output.lanes).to.have.lengthOf(2);
      expect(output.lanes[0].id.name).to.have.string('dev');
    });
    it('lane list -r should show the remote lanes', () => {
      const cmd = () => helper.command.listRemoteLanes();
      expect(cmd).to.not.throw();
    });
    it('bit import on a local lane tracked to a valid remote scope should not throw an error', () => {
      helper.command.createLane('test');
      const cmd = () => helper.command.install();
      expect(cmd).to.not.throw();
    });
    // previously it was throwing UnexpectedNetworkError without any message.
    it('bit lane remove -r should not remove the remote lane without --force flag as it was not fully merged', () => {
      expect(() => helper.command.removeRemoteLane()).to.throw(
        'unable to remove dev lane, it is not fully merged. to disregard this error, please use --force flag'
      );
    });
    it('bit lane remove -r -f should remove the remote lane', () => {
      helper.command.removeRemoteLane('dev', '--force');
      const output = helper.command.listRemoteLanesParsed();
      expect(output.lanes).to.have.lengthOf(1);
    });
    // previously it was throwing UnexpectedNetworkError without any message.
    it('bit lane remove -r of a non-existing lane should throw a descriptive error', () => {
      expect(() => helper.command.removeRemoteLane('non-exist')).to.throw('lane "non-exist" was not found');
    });
    after(() => {
      httpHelper.killHttp();
    });
  });
  describe('export with removed components', () => {
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.removeComponent('comp2', '--soft');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('bit list -r should show not show the removed component', () => {
      const list = helper.command.listRemoteScopeParsed();
      expect(list).to.have.lengthOf(1);
      expect(list[0].id).to.not.have.string('comp2');
    });
    after(() => {
      httpHelper.killHttp();
    });
  });
  describe('export', () => {
    let exportOutput: string;
    let scopeAfterExport: string;
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', {});
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      exportOutput = helper.command.export();
      scopeAfterExport = helper.scopeHelper.cloneLocalScope();
    });
    after(() => {
      httpHelper.killHttp();
    });
    it('should export successfully', () => {
      expect(exportOutput).to.have.string('exported the following 3 component');
    });
    describe('bit log', () => {
      let logOutput: string;
      before(() => {
        logOutput = helper.command.log(`${helper.scopes.remote}/comp1 --remote`);
      });
      it('should show the log correctly', () => {
        expect(logOutput).to.have.string('tag 0.0.1');
        expect(logOutput).to.have.string('author');
        expect(logOutput).to.have.string('date');
      });
    });
    describe('bit import', () => {
      let importOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteHttpScope();
        importOutput = helper.command.importComponent('comp1');
      });
      it('should import successfully', () => {
        expect(importOutput).to.have.string('successfully imported one component');
      });
    });
    describe('bit remove --remote', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterExport);
      });
      it('should show descriptive error when removing component that has dependents', () => {
        const output = helper.command.removeComponent(`${helper.scopes.remote}/comp2`, '--remote');
        expect(output).to.have.string(`error: unable to delete ${helper.scopes.remote}/comp2`);
        expect(output).to.have.string(`${helper.scopes.remote}/comp1`);
      });
      it('should remove successfully components that has no dependents', () => {
        const output = helper.command.removeComponent(`${helper.scopes.remote}/comp1`, '--remote');
        expect(output).to.have.string('successfully removed components');
        expect(output).to.have.string('comp1');
      });
    });
  });
});
