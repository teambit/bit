import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit log', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a component does not have all versions in the scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.tagScope('2.0.0', 'new-tagging-message');
      helper.command.export(); // just a quick test to make sure export with no ids and multiple versions works
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    // @todo: this fails when lane features is enabled because it has "parents" and this "parents"
    // causes dependencies to be fetched completely.
    it('should not throw an error and should indicate that that version has no data', () => {
      const output = helper.command.log('utils/is-string');
      expect(output).to.have.string('0.0.1');
      expect(output).to.have.string('<no-data-available>');
      expect(output).to.have.string('2.0.0');
      expect(output).to.have.string('new-tagging-message');
    });
    describe('exporting NESTED component which does not have all its versions', () => {
      it('should not throw an error about object not found, but a descriptive one', () => {
        const output = helper.general.runWithTryCatch(`bit export ${helper.scopes.remote} utils/is-string`);
        expect(output).not.to.have.string('ENOENT');
        expect(output).to.have.string('unable to export');
      });
    });
  });
  describe('log of a remote component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should show the log successfully', () => {
      const output = helper.command.log(`${helper.scopes.remote}/bar/foo --remote`);
      expect(output).to.have.string('0.0.1');
      expect(output).to.have.string('author');
      expect(output).to.have.string('date');
    });
  });
});
