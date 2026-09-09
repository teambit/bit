import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('lane history with deleted components', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  // checkout and the two revert variants all start from the same state (a lane whose comp1 and
  // comp2 were deleted), and each mutates the workspace. build it once and restore a clone per
  // scenario rather than re-running the whole snap/delete/export flow three times.
  describe('a lane where two of three components were deleted with bit delete --lane', () => {
    let historyBeforeDelete: string;
    let afterDelete: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "add three components"');
      helper.command.exportLane();

      const history = helper.command.laneHistoryParsed();
      historyBeforeDelete = history[history.length - 1].id;

      helper.command.softRemoveOnLane('comp1');
      helper.command.softRemoveOnLane('comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "delete comp1 and comp2"');
      helper.command.exportLane();

      // intermediate step: only comp3 is left in the workspace
      expect(helper.command.listParsed()).to.have.lengthOf(1);

      afterDelete = helper.scopeHelper.cloneWorkspace();
    });

    describe('bit lane checkout to the entry before the deletion', () => {
      let output: string;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterDelete);
        output = helper.command.runCmd(`bit lane checkout ${historyBeforeDelete}`);
      });

      it('should checkout without errors about missing components', () => {
        expect(output).to.not.include('cannot find component');
      });

      it('should restore all deleted components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(3);
        const ids = list.map((c) => c.id);
        ['comp1', 'comp2', 'comp3'].forEach((name) => {
          expect(
            ids.some((id) => id.includes(name)),
            `${name} should be restored`
          ).to.be.true;
        });
      });
    });

    describe('bit lane revert to that entry, without --restore-deleted-components', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterDelete);
      });

      it('should not throw (revert leaves deleted components deleted)', () => {
        expect(() => helper.command.runCmd(`bit lane revert ${historyBeforeDelete}`)).to.not.throw();
      });
    });

    describe('bit lane revert to that entry, with --restore-deleted-components', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterDelete);
        helper.command.runCmd(`bit lane revert ${historyBeforeDelete} --restore-deleted-components`);
      });

      it('should restore the deleted components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(3);
        const ids = list.map((c) => c.id);
        ['comp1', 'comp2', 'comp3'].forEach((name) => {
          expect(
            ids.some((id) => id.includes(name)),
            `${name} should be restored`
          ).to.be.true;
        });
      });
    });
  });

  describe('reverting with a mixed scenario: one component modified, two deleted', () => {
    let historyBeforeChanges: string;
    let comp3VersionBeforeChanges: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "add three components"');
      helper.command.exportLane();

      // Get the history ID and comp3 version before any changes
      const history = helper.command.laneHistoryParsed();
      historyBeforeChanges = history[history.length - 1].id;
      const listBefore = helper.command.listParsed();
      const comp3Before = listBefore.find((c) => c.id.includes('comp3'));
      comp3VersionBeforeChanges = comp3Before!.id.split('@')[1];

      // Modify comp3
      helper.fs.outputFile('comp3/index.js', 'console.log("modified");');
      helper.command.snapAllComponentsWithoutBuild('-m "modify comp3"');

      // Delete comp1 and comp2
      helper.command.softRemoveOnLane('comp1');
      helper.command.softRemoveOnLane('comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "delete comp1 and comp2"');
      helper.command.exportLane();
    });

    it('should keep modified component version in bitmap but restore its files', () => {
      const listBeforeRevert = helper.command.listParsed();
      const comp3BeforeRevert = listBeforeRevert.find((c) => c.id.includes('comp3'));
      if (!comp3BeforeRevert) {
        throw new Error('comp3 not found before revert');
      }
      const comp3VersionAfterModification = comp3BeforeRevert.currentVersion || comp3BeforeRevert.version;
      if (!comp3VersionAfterModification) {
        throw new Error(`comp3 version not found. Available fields: ${JSON.stringify(Object.keys(comp3BeforeRevert))}`);
      }

      // Read bitmap before revert to verify comp3 version
      const bitmapBeforeRevert = helper.bitMap.read();
      const comp3InBitmapBefore = Object.keys(bitmapBeforeRevert).find((key) => key.includes('comp3'));
      const comp3VersionInBitmapBefore = bitmapBeforeRevert[comp3InBitmapBefore!].version;

      helper.command.runCmd(`bit lane revert ${historyBeforeChanges} --restore-deleted-components`);

      // All three components should be in the list
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(3);

      // comp3 should keep the modified version in bitmap (revert behavior)
      const comp3 = list.find((c) => c.id.includes('comp3'));
      const comp3VersionAfterRevert = comp3!.currentVersion || comp3!.version;
      expect(comp3VersionAfterRevert).to.equal(comp3VersionAfterModification);
      expect(comp3VersionAfterRevert).to.not.equal(comp3VersionBeforeChanges);

      // Verify the version in .bitmap file remains the same
      const bitmapAfterRevert = helper.bitMap.read();
      const comp3InBitmapAfter = Object.keys(bitmapAfterRevert).find((key) => key.includes('comp3'));
      const comp3VersionInBitmapAfter = bitmapAfterRevert[comp3InBitmapAfter!].version;
      expect(comp3VersionInBitmapAfter).to.equal(comp3VersionInBitmapBefore);
      expect(comp3VersionInBitmapAfter).to.equal(comp3VersionAfterModification);

      // comp1 and comp2 should be restored with their historical versions
      const comp1 = list.find((c) => c.id.includes('comp1'));
      const comp2 = list.find((c) => c.id.includes('comp2'));
      expect(comp1).to.not.be.undefined;
      expect(comp2).to.not.be.undefined;

      // comp3 files should be reverted to the old content
      const comp3Content = helper.fs.readFile('comp3/index.js');
      expect(comp3Content).to.not.include('modified');
    });
  });
});
