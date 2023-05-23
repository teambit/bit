import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit checkout command when on a lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('checkout head when some components are merge-pending', () => {
    let originalWs: string;
    let output: string;
    let comp1Head: string;
    let comp2RemoteHead: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      originalWs = helper.scopeHelper.cloneLocalScope();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2RemoteHead = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(originalWs);
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      comp1Head = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.import();
      output = helper.command.checkoutHead();
    });
    it('should not allow checking out to head because it is merge pending', () => {
      expect(output).to.have.string('component is merge-pending and cannot be checked out');
    });
    it('should leave the merge-pending component with the current version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal(comp1Head);
    });
    it('should update the non-merge-pending component to the latest', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp2.version).to.equal(comp2RemoteHead);
    });
  });
});
