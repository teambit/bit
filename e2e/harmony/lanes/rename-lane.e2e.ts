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
  describe('rename lane using the alias', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev', '--alias d');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.renameLane('d', 'new-dev');
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
