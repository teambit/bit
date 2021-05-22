import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit show command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running bit show --remote on an empty workspace', () => {
    let showOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      showOutput = helper.command.showComponent(`${helper.scopes.remote}/comp1 --remote`);
    });
    it('should show the remote component successfully', () => {
      expect(showOutput).to.include(`${helper.scopes.remote}/comp1@0.0.1`);
    });
    it('should show Harmony data such as the env', () => {
      expect(showOutput).to.include('env');
      expect(showOutput).to.include('teambit.harmony/node');
    });
    it('should not import any object to the local scope', () => {
      const objects = helper.command.catScope();
      expect(objects).to.have.lengthOf(0);
    });
  });
});
