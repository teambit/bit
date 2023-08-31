import chai, { expect } from 'chai';
import { LANE_KEY } from '../../../src/consumer/bit-map/bit-map';
import Helper from '../../../src/e2e-helper/e2e-helper';

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
  describe('rename current lane when one argument provided', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.switchLocalLane('main');
      helper.command.createLane('dev2');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.renameLane('new-dev');
    });
    it('should rename current lane when only one argument provided', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('new-dev');
    });
    it('should not throw on any command', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('should update .bitmap with the new name', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('new-dev');
    });
  });
  describe('rename specified lane when second argument provided', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.switchLocalLane('main');
      helper.command.createLane('dev2');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.renameLane('dev', 'new-dev');
    });
    it('should rename current lane when only one argument provided', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('dev2'); // ensure didnt change current lane
      // expect to not be able to switch to old name of 'dev' lane
      expect(() => helper.command.switchLocalLane('dev')).to.throw();
      // and to be able to switch to the new lane name of 'dev'
      expect(() => helper.command.switchLocalLane('new-dev')).to.not.throw();
    });
    it('should not throw on any command', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('.bitmap should now be on the "new-dev" (formerly "dev") branch', () => {
      helper.command.switchLocalLane('new-dev');
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('new-dev');
    });
  });
  describe('rename lane using the alias', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
});
