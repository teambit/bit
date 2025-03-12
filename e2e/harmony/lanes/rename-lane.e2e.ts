import chai, { expect } from 'chai';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('rename lanes', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('rename lane using the alias', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev', '--alias d');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.renameLane('new-dev');
    });
    it('should not throw on any command', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('should update .bitmap with the new name', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('new-dev');
    });
  });
  // previous bug left the "lanes.new" prop in scope.json with the old name causing bit later to assume it's exported.
  describe('rename local lane, switch to main and then switch back to the lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.command.renameLane('new-dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
      helper.command.switchLocalLane('new-dev');
    });
    it('bit import should not throw', () => {
      expect(() => helper.command.import()).not.to.throw();
    });
    it('should not show the lane as if it was exported', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap[LANE_KEY].exported).to.be.false;
    });
  });
});
