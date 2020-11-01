import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit import command with no ids', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with a component in bit.map', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitMap.write(bitMap);
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.command.importAllComponents(true);
      expect(output.includes('successfully imported one component')).to.be.true;
    });
    describe('running bit import with --environment flag when no compiler nor tester is installed', () => {
      let output;
      before(() => {
        output = helper.command.runCmd('bit import --environment');
      });
      it('should not throw an error', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
  });

  describe('with components in bit.map when they are modified locally', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitMap.write(bitMap);
      helper.command.importAllComponents(true);
      const barFooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; };";
      helper.fs.createFile('bar', 'foo.js', barFooFixtureV2);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('without any flag', () => {
      // should import objects only
      let output;
      before(() => {
        output = helper.command.importAllComponents();
      });
      it('should not display a warning saying it was unable to import', () => {
        expect(output).to.not.have.string('unable to import');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
        expect(output).to.have.string('bar/foo');
      });
    });
    describe('with --override flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.runCmd('bit import --override');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
        expect(output).to.have.string('bar/foo');
      });
      it('should override them all', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
        expect(statusOutput).to.not.have.string('bar/foo');
      });
    });
    describe('with --merge=manual flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.runCmd('bit import --merge=manual');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
        expect(output).to.have.string('bar/foo');
      });
      it('should show them as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('after tagging', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagAllComponents();
        output = helper.command.runCmd('bit import --merge=manual');
      });
      it('should display a successful message', () => {
        // before, it'd throw an error component-not-found as the tag exists only locally
        expect(output).to.have.string('successfully imported');
        expect(output).to.have.string('bar/foo');
      });
    });
  });

  describe('with an AUTHORED component which was only tagged but not exported', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitMap.write(bitMap);
    });
    it('should not try to import that component as it was not exported yet', () => {
      try {
        helper.command.importAllComponents(true);
      } catch (err) {
        expect(err.toString()).to.have.string('nothing to import');
      }
    });
  });
});
