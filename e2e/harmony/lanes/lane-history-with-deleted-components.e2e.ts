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

  /**
   * Sets up a lane with 3 components, then deletes 2 of them.
   * Returns the history ID from before the deletion.
   */
  function setupLaneWithDeletedComponents(): string {
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.populateComponents(3);
    helper.command.createLane('dev');
    helper.command.snapAllComponentsWithoutBuild('-m "add three components"');
    helper.command.exportLane();

    // Get the history ID before deletion
    const history = helper.command.laneHistoryParsed();
    const historyBeforeDelete = history[history.length - 1].id;

    // Delete components using bit delete --lane
    helper.command.softRemoveOnLane('comp1');
    helper.command.softRemoveOnLane('comp2');
    helper.command.snapAllComponentsWithoutBuild('--unmodified -m "delete comp1 and comp2"');
    helper.command.exportLane();

    return historyBeforeDelete;
  }

  describe('checking out to a point in history before components were deleted using bit delete --lane', () => {
    let historyBeforeDelete: string;
    before(() => {
      historyBeforeDelete = setupLaneWithDeletedComponents();

      // Verify components are actually deleted
      const listAfterDelete = helper.command.listParsed();
      if (listAfterDelete.length !== 1) {
        throw new Error(`Expected 1 component after deletion, got ${listAfterDelete.length}`);
      }
    });

    it('should be able to checkout to the point before deletion without errors', () => {
      const output = helper.command.runCmd(`bit lane checkout ${historyBeforeDelete}`);
      expect(output).to.not.include('cannot find component');
    });

    it('should restore all deleted components after checkout', () => {
      helper.command.runCmd(`bit lane checkout ${historyBeforeDelete}`);
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(3);
      const comp1 = list.find((c) => c.id.includes('comp1'));
      const comp2 = list.find((c) => c.id.includes('comp2'));
      const comp3 = list.find((c) => c.id.includes('comp3'));
      expect(comp1).to.not.be.undefined;
      expect(comp2).to.not.be.undefined;
      expect(comp3).to.not.be.undefined;
    });
  });

  describe('reverting to a point in history before components were deleted using bit delete --lane', () => {
    describe('without --restore-deleted-components flag', () => {
      let historyBeforeDelete: string;
      before(() => {
        historyBeforeDelete = setupLaneWithDeletedComponents();
      });

      it('should not throw an error when reverting to a point before deletion', () => {
        // Revert doesn't restore deleted components by default, but it should not throw an error
        expect(() => helper.command.runCmd(`bit lane revert ${historyBeforeDelete}`)).to.not.throw();
      });
    });

    describe('with --restore-deleted-components flag', () => {
      let historyBeforeDelete: string;
      before(() => {
        historyBeforeDelete = setupLaneWithDeletedComponents();
      });

      it('should restore deleted components when using the flag', () => {
        helper.command.runCmd(`bit lane revert ${historyBeforeDelete} --restore-deleted-components`);
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(3);
        const comp1 = list.find((c) => c.id.includes('comp1'));
        const comp2 = list.find((c) => c.id.includes('comp2'));
        const comp3 = list.find((c) => c.id.includes('comp3'));
        expect(comp1).to.not.be.undefined;
        expect(comp2).to.not.be.undefined;
        expect(comp3).to.not.be.undefined;
      });
    });

    describe('with mixed scenario: modified component and deleted component', () => {
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
          throw new Error(
            `comp3 version not found. Available fields: ${JSON.stringify(Object.keys(comp3BeforeRevert))}`
          );
        }

        helper.command.runCmd(`bit lane revert ${historyBeforeChanges} --restore-deleted-components`);

        // All three components should be in the list
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(3);

        // comp3 should keep the modified version in bitmap (revert behavior)
        const comp3 = list.find((c) => c.id.includes('comp3'));
        const comp3VersionAfterRevert = comp3!.currentVersion || comp3!.version;
        expect(comp3VersionAfterRevert).to.equal(comp3VersionAfterModification);
        expect(comp3VersionAfterRevert).to.not.equal(comp3VersionBeforeChanges);

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
});
