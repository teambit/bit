import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit reset when on lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snapping on a lane, switching to main, snapping and running "bit reset"', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
      helper.command.untagAll();
    });
    it('should not delete the head of the lane', () => {
      expect(() => helper.command.catObject(headOnLane)).to.not.throw();
    });
    it('bit status should not throw after switching to the lane', () => {
      helper.command.switchLocalLane('dev');
      expect(() => helper.command.status()).not.to.throw();
    });
  });
});
