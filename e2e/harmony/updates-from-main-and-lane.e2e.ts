import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('updates from main and lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('updates are available from both main and lane', () => {
    let scopeBeforeUpdate: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      scopeBeforeUpdate = helper.scopeHelper.cloneLocalScope();

      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main');
      helper.command.tagWithoutBuild('comp2', '--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(scopeBeforeUpdate);
      helper.command.import();
    });
    it('by default should only show updates from the current lane', () => {
      const status = helper.command.statusJson();
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.outdatedComponents[0].id).to.have.string('comp1');

      expect(status.pendingUpdatesFromMain).to.have.lengthOf(0);
    });
    it('with --lanes flag, should show updates from main', () => {
      const status = helper.command.statusJson(undefined, '--lanes');
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.outdatedComponents[0].id).to.have.string('comp1');

      expect(status.pendingUpdatesFromMain).to.have.lengthOf(2);
    });
    it('should show only one snap pending for comp2', () => {
      const status = helper.command.statusJson(undefined, '--lanes');
      const comp2 = status.pendingUpdatesFromMain.find((c) => c.id.includes('comp2'));
      expect(comp2.divergeData.snapsOnTargetOnly).to.have.lengthOf(1);
    });
    describe('bit checkout', () => {
      let checkoutOutput: string;
      before(() => {
        checkoutOutput = helper.command.checkoutHead('--skip-dependency-installation');
      });
      it('should update only components from the current lane', () => {
        expect(checkoutOutput).to.have.string('comp1');
        expect(checkoutOutput).not.to.have.string('comp2');
      });
    });
  });
});
