import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('run bit env set and then tag when the variants points to another env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', undefined, true);
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.tagAllWithoutBuild();
    });
    it('should not be modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.have.lengthOf(0);
    });
    it('should not change the env to the variants one', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal('teambit.harmony/aspect');
    });
  });
  describe('run bit env set X and then tag bit env set Y', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.setEnv('comp1', 'teambit.react/react');
    });
    it('should replace the env with the last one and remove the first one', () => {
      const show = helper.command.showComponent('comp1');
      expect(show).to.not.have.string('teambit.harmony/aspect');
    });
  });
});
