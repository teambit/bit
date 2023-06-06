import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('lane with multiple components with the same name but different scope-name', function () {
  this.timeout(0);
  let helper: Helper;
  let anotherRemote: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
    anotherRemote = scopeName;

    helper.fixtures.populateComponents(2);
    helper.command.createLane('lane-a');
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();

    helper.scopeHelper.reInitLocalScope();
    helper.scopeHelper.addRemoteScope();
    helper.scopeHelper.addRemoteScope(scopePath);
    helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
    helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
    helper.bitJsonc.addDefaultScope(scopeName);
    helper.fixtures.populateComponents(1);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();

    helper.scopeHelper.reInitLocalScope();
    helper.scopeHelper.addRemoteScope();
    helper.scopeHelper.addRemoteScope(scopePath);
    // this bring the lane-object with two components: comp1 and comp2 of `helper.scopes.remote`.
    helper.command.importLane('lane-a', `--pattern ${helper.scopes.remote}/comp2 -x`);
    helper.command.import(`${anotherRemote}/comp1 -x`);
    // this adds the ${anotherRemote}/comp1 to the lane. so now the lane should have two components with the same name
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should not replace the component in the remote-lane, but keep both of them', () => {
    const lane = helper.command.catLane('lane-a', helper.scopes.remotePath);
    expect(lane.components).to.have.lengthOf(3);
  });
  describe('importing the lane into a new workspace without excluding any component', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should fail due to duplication of the same name in the same workspace', () => {
      expect(() => helper.command.importLane('lane-a')).to.throw('duplicate');
    });
  });
  describe('importing the lane into a new workspace by excluding one of the duplicate names', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should import successfully', () => {
      expect(() => helper.command.importLane('lane-a', `--pattern '!${anotherRemote}/comp1' -x`)).to.not.throw();
    });
  });
});
