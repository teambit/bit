import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

/**
 * Tests for `bit reset` after `bit lane merge main`.
 *
 * bit reset never changes files — it only removes local snaps/tags and reverts lane heads
 * to match the remote lane state. If files were modified by the merge, they remain on disk
 * and show as "modified" in bit status. To fully undo a merge (including files), use
 * `bit lane merge-abort`.
 */
describe('bit reset after merging main into a lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  /**
   * Case 1: Lane and main are diverged, no conflicts → auto-snap happens.
   * The auto-snap creates a merge snap with two parents (lane head + main head).
   * bit reset removes this snap and reverts the lane head to its pre-merge state.
   * Files remain with the merged content and show as modified.
   */
  describe('diverged with no conflicts (auto-snap after merge)', () => {
    let headOnLaneBefore: string;
    let headOnLaneAfterMerge: string;
    let afterMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'lane-version');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneBefore = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(1, undefined, 'main-version');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '--auto-merge-resolve theirs -x');
      headOnLaneAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
      afterMerge = helper.scopeHelper.cloneWorkspace();
    });

    it('merge should have created a new snap with two parents', () => {
      expect(headOnLaneAfterMerge).to.not.equal(headOnLaneBefore);
      const versionObj = helper.command.catComponent(`comp1@${headOnLaneAfterMerge}`);
      expect(versionObj.parents).to.have.lengthOf(2);
    });

    describe('after running bit reset', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterMerge);
        helper.command.resetAll();
      });

      it('should revert the lane head to its pre-merge state', () => {
        const headAfterReset = helper.command.getHeadOfLane('dev', 'comp1');
        expect(headAfterReset).to.equal(headOnLaneBefore);
      });

      it('should not change the files (merged content remains on disk)', () => {
        const content = helper.fs.readFile('comp1/index.js');
        expect(content).to.have.string('main-version');
      });

      it('should show the component as modified since files do not match the reverted lane head', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
        expect(status.stagedComponents).to.have.lengthOf(0);
      });
    });
  });

  /**
   * Case 2: Main is ahead, lane has an unmodified snap.
   * Even though the lane content is identical to main's base, the unmodified snap creates
   * a different hash, so the merge still produces an auto-snap (diverge).
   * bit reset removes this snap and reverts the lane head to the pre-merge state.
   * Files remain with main's content and show as modified.
   */
  describe('main is ahead, lane has an unmodified snap', () => {
    let headOnLaneBefore: string;
    let headOnLaneAfterMerge: string;
    let afterMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      headOnLaneBefore = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(1, undefined, 'main-v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x');
      headOnLaneAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
      afterMerge = helper.scopeHelper.cloneWorkspace();
    });

    it('merge should have created an auto-snap with two parents (diverge, not fast-forward)', () => {
      expect(headOnLaneAfterMerge).to.not.equal(headOnLaneBefore);
      const versionObj = helper.command.catComponent(`comp1@${headOnLaneAfterMerge}`);
      expect(versionObj.parents).to.have.lengthOf(2);
    });

    describe('after running bit reset', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterMerge);
        helper.command.resetAll();
      });

      it('should revert the lane head to its pre-merge state', () => {
        const headAfterReset = helper.command.getHeadOfLane('dev', 'comp1');
        expect(headAfterReset).to.equal(headOnLaneBefore);
      });

      it('should not change the files (main content remains on disk)', () => {
        const content = helper.fs.readFile('comp1/index.js');
        expect(content).to.have.string('main-v2');
      });

      it('should show the component as modified since files do not match the reverted lane head', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
        expect(status.stagedComponents).to.have.lengthOf(0);
      });
    });
  });

  /**
   * Case 3: Using --no-auto-snap flag (diverged, but no snap is created).
   * Because no snap was made, bit reset has nothing to reset and throws
   * "no components found to reset". The lane head and files are unchanged.
   */
  describe('diverged with --no-auto-snap (no snap created)', () => {
    let headOnLaneBefore: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'from-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneBefore = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(1, undefined, 'from-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '--auto-merge-resolve theirs --no-auto-snap -x');
    });

    it('lane head should not have changed (no snap was made)', () => {
      const headAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
      expect(headAfterMerge).to.equal(headOnLaneBefore);
    });

    it('bit reset should throw because there is nothing to reset', () => {
      expect(() => helper.command.resetAll()).to.throw('no components found to reset');
    });
  });

  /**
   * Case 4: Using --no-snap flag (diverged).
   * Unlike --no-auto-snap, --no-snap also prevents the lane head from being updated.
   * The files get the merged content but the lane object stays untouched.
   * bit reset has nothing to reset.
   */
  describe('diverged with --no-snap (no snap, no head change)', () => {
    let headOnLaneBefore: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'from-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneBefore = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(1, undefined, 'from-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '--auto-merge-resolve theirs --no-snap -x');
    });

    it('lane head should not have changed', () => {
      const headAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
      expect(headAfterMerge).to.equal(headOnLaneBefore);
    });

    it('files should have the merged content and show as modified', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.have.string('from-main');
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
    });

    it('bit reset should throw because there is nothing to reset', () => {
      expect(() => helper.command.resetAll()).to.throw('no components found to reset');
    });
  });

  /**
   * Case 5: Using --no-snap with main ahead (fast-forward).
   * --no-snap prevents both snap creation AND lane head updates, even when
   * the merge would normally just advance the lane head.
   * Files get main's content but the lane object stays untouched.
   * bit reset has nothing to reset.
   */
  describe('main is ahead with --no-snap (no snap, no head change)', () => {
    let headOnLaneBefore: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      headOnLaneBefore = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(1, undefined, 'main-v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '--no-snap -x');
    });

    it('lane head should not have changed', () => {
      const headAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
      expect(headAfterMerge).to.equal(headOnLaneBefore);
    });

    it('files should have main content and show as modified', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.have.string('main-v2');
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
    });

    it('bit reset should throw because there is nothing to reset', () => {
      expect(() => helper.command.resetAll()).to.throw('no components found to reset');
    });
  });
});
