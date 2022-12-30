import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('lane-b was forked from lane-a and they are now diverged', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    helper.command.createLane('lane-b');
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
    helper.command.switchLocalLane('lane-a');
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
    helper.command.switchLocalLane('lane-b');
  });
  it('bit status should have the diverged component in the updatesFromForked section', () => {
    const status = helper.command.statusJson(undefined, '--lanes');
    expect(status.updatesFromForked).to.have.lengthOf(1);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
});
