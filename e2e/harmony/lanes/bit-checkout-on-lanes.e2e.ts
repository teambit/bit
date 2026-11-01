import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      originalWs = helper.scopeHelper.cloneWorkspace();
      // a real change on comp2, so a checkout that writes files before aborting shows on the filesystem
      helper.fs.appendFile('comp2/index.js', '\n// remote-head-change');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2RemoteHead = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(originalWs);
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
    // .bitmap is persisted only at the end of a command, so it alone can't catch files written before the abort
    it('should not write the files of the non-merge-pending component', () => {
      expect(helper.fs.readFile('comp2/index.js')).to.not.include('remote-head-change');
    });
  });
  describe('checkout head on main when some components are not available on main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      // as an intermediate step, make sure that comp2 is not available on main
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);

      // merge in another workspace
      const workspaceBeforeMerge = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.mergeLaneWithoutBuild('dev', '-x');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(workspaceBeforeMerge);
      helper.command.checkoutHead('-x');
    });
    it('should make them available on main even without running bit-import before', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
  });
});
