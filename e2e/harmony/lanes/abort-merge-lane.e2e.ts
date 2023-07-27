import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane merge-abort command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when the lane was merged successfully without conflicts or diverged', () => {
    let bitMapBeforeMerge;
    let bitMapAfterMerge;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      bitMapBeforeMerge = helper.bitMap.read();
      helper.command.mergeLane('lane-b', '-x');
      bitMapAfterMerge = helper.bitMap.read();
      helper.command.mergeAbortLane('-x');
    });
    it('should revert the .bitmap to the state before the merge', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.version).to.equal(bitMapBeforeMerge.comp1.version);
      expect(bitMap.comp1.version).to.not.equal(bitMapAfterMerge.comp1.version);
    });
    it('should revert the lane object to the state before the merge', () => {
      const laneObj = helper.command.catLane('lane-a');
      const compA = laneObj.components.find((c) => c.id.name === 'comp1');
      expect(compA.head).to.equal(bitMapBeforeMerge.comp1.version);
      expect(compA.head).to.not.equal(bitMapAfterMerge.comp1.version);
    });
    it('should reset the source code to pre-merge', () => {
      const comp1Content = helper.fs.readFile('comp1/index.js');
      expect(comp1Content).to.not.include('v2');
    });
  });
});
