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
      // should not allow checking out to head because it is merge pending
      expect(() => helper.command.checkoutHead()).to.throw('component is merge-pending and cannot be checked out');
    });
    it('should leave the merge-pending component with the current version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal(comp1Head);
    });
    it('should not update the non-merge-pending component to the latest', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp2.version).to.not.equal(comp2RemoteHead);
    });
  });
  describe('checkout head on main when some components are not available on main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      // helper.fixtures.populateComponents(2);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      // as an intermediate step, make sure that comp2 is not available on main
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);

      // merge the lane from a bare-scope
      const bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');

      helper.command.checkoutHead('-x');
    });
    it('should make them available on main even without running bit-import before', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
  });
  describe('checkout when some are pending-merge', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.command.tagWithoutBuild('comp1', '--unmodified');
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x'); // comp1 is now pending-merge

      const originalWs = helper.scopeHelper.cloneLocalScope();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');

      helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`, 'console.log("v2");');
      helper.command.snapComponentWithoutBuild('comp3');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(originalWs);
    });
    it('checkout head should stop with an error', () => {
      expect(() => helper.command.checkoutHead('-x')).to.throw();
    });
    it('should not merged the head of other components', () => {
      const comp3File = helper.fs.readFile('comp3/index.js');
      expect(comp3File).to.not.include('v2');
    });
  });
});
