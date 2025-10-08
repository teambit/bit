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

  describe('checking out to a point in history before components were deleted using bit delete --lane', () => {
    let historyBeforeDelete: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "add three components"');
      helper.command.exportLane();

      // Get the history ID before deletion
      const historyOutput = helper.command.runCmd('bit lane history --json');
      const history = JSON.parse(historyOutput);
      if (!history || !history.length) {
        throw new Error('Could not find history in output');
      }
      // Get the most recent history item
      historyBeforeDelete = history[history.length - 1].id;

      // Delete components using bit delete --lane
      helper.command.softRemoveOnLane('comp1');
      helper.command.softRemoveOnLane('comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "delete comp1 and comp2"');
      helper.command.exportLane();

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
    let historyBeforeDelete: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('-m "add three components"');
      helper.command.exportLane();

      // Get the history ID before deletion
      const historyOutput = helper.command.runCmd('bit lane history --json');
      const history = JSON.parse(historyOutput);
      if (!history || !history.length) {
        throw new Error('Could not find history in output');
      }
      // Get the most recent history item
      historyBeforeDelete = history[history.length - 1].id;

      // Delete components using bit delete --lane
      helper.command.softRemoveOnLane('comp1');
      helper.command.softRemoveOnLane('comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "delete comp1 and comp2"');
      helper.command.exportLane();
    });

    it('should not throw an error when reverting to a point before deletion', () => {
      // Revert doesn't restore deleted components, but it should not throw an error
      expect(() => helper.command.runCmd(`bit lane revert ${historyBeforeDelete}`)).to.not.throw();
    });
  });
});
