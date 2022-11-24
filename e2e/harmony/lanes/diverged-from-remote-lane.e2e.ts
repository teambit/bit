import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('local is diverged from the remote', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
    helper.command.createLane();
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    const beforeDiverge = helper.scopeHelper.cloneLocalScope();
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
    helper.scopeHelper.getClonedLocalScope(beforeDiverge);
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.import();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('bit status should show it as merge-pending', () => {
    const status = helper.command.statusJson();
    expect(status.mergePendingComponents).to.have.lengthOf(1);
  });
  it('bit reset should not throw', () => {
    expect(() => helper.command.untagAll()).to.not.throw();
  });
});
