import chai, { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit scope command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit scope fork', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.forkScope(helper.scopes.remote, 'org.scope');
    });
    it('should show the forked components from the scope', () => {
      expect(output).to.have.string('org.scope/comp1');
      expect(output).to.have.string('org.scope/comp2');
      expect(output).to.have.string('org.scope/comp3');
    });
    it('bit show should show the original component in the fork section', () => {
      const showFork = helper.command.showAspectConfig('comp1', Extensions.forking);
      expect(showFork.config).to.have.property('forkedFrom');
      expect(showFork.config.forkedFrom.scope).to.equal(helper.scopes.remote);
      expect(showFork.config.forkedFrom.name).to.equal('comp1');
    });
  });
});
