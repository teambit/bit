import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit log', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a component does not have all versions in the scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.tagScope('2.0.0', 'new-tagging-message');
      helper.command.export(); // just a quick test to make sure export with no ids and multiple versions works
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should not throw an error and should indicate that that version has no data', () => {
      const output = helper.command.log('utils/is-string');
      expect(output).to.have.string('0.0.1');
      expect(output).to.have.string('<no-data-available>');
      expect(output).to.have.string('2.0.0');
      expect(output).to.have.string('new-tagging-message');
    });
  });
});
